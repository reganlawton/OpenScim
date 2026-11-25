"""Compare two trimmed cache zips group by group, after decompression.

    python tools/assets/compare-caches.py A/disk.zip B/disk.zip

Every listed group (cache-groups.json and cache-groups/*.json, as
cache-groups.mjs reads them) must exist in both and decode (none/bzip2/gzip)
to the same payload. Exits 1 on any mismatch.
"""
import bz2, collections, glob, io, json, os, sys, zipfile, zlib

NAMES = {0: "none", 1: "bzip2", 2: "gzip"}


class Cache:
    def __init__(self, path):
        z = zipfile.ZipFile(path)
        self.files = {n.split("/")[-1].removeprefix("main_file_cache."): z.read(n) for n in z.namelist() if "main_file_cache." in n}
        self.dat = self.files["dat2"]

    def present(self, archive):
        idx = self.files["idx%d" % archive]
        return [g for g in range(len(idx) // 6) if int.from_bytes(idx[g * 6 : g * 6 + 6], "big")]

    def stored(self, archive, group):
        idx = self.files["idx%d" % archive]
        size = int.from_bytes(idx[group * 6 : group * 6 + 3], "big")
        sector = int.from_bytes(idx[group * 6 + 3 : group * 6 + 6], "big")
        if not size or not sector:
            return None
        header = 10 if group > 0xFFFF else 8
        out, chunk = bytearray(), 0
        while len(out) < size:
            s = self.dat[sector * 520 : sector * 520 + 520]
            assert int.from_bytes(s[: header - 6], "big") == group, "sector group id"
            assert int.from_bytes(s[header - 6 : header - 4], "big") == chunk, "sector chunk"
            assert s[header - 1] == archive, "sector archive id"
            out += s[header : header + size - len(out)]
            sector = int.from_bytes(s[header - 4 : header - 1], "big")
            chunk += 1
        return bytes(out)


def decode(stored):
    kind, length = stored[0], int.from_bytes(stored[1:5], "big")
    if kind == 0:
        return kind, stored[5 : 5 + length]
    size, body = int.from_bytes(stored[5:9], "big"), stored[9 : 9 + length]
    data = bz2.decompress(b"BZh1" + body) if kind == 1 else zlib.decompress(body, 31)
    assert len(data) == size, "uncompressed length"
    return kind, data


a, b = Cache(sys.argv[1]), Cache(sys.argv[2])
here = os.path.dirname(os.path.abspath(__file__))
listed = collections.defaultdict(set)
for path in [os.path.join(here, "cache-groups.json")] + sorted(glob.glob(os.path.join(here, "cache-groups", "*.json"))):
    for key, ids in json.load(open(path)).items():
        listed[key].update(ids)
groups = {key: sorted(ids) for key, ids in listed.items()}
bad = 0
for key, ids in groups.items():
    archive = int(key)
    kinds, same_bytes, mismatched = [collections.Counter(), collections.Counter()], 0, 0
    for group in ids:
        sa, sb = a.stored(archive, group), b.stored(archive, group)
        if sa is None or sb is None:
            mismatched += 1
            print("  MISSING %d/%d in %s" % (archive, group, "A" if sa is None else "B"))
            continue
        (ka, da), (kb, db) = decode(sa), decode(sb)
        kinds[0][NAMES[ka]] += 1
        kinds[1][NAMES[kb]] += 1
        same_bytes += sa == sb
        if da != db:
            mismatched += 1
            print("  DIFF %d/%d" % (archive, group))
    extra = [set(c.present(archive)) - set(ids) for c in (a, b)]
    idx_len = [len(c.files["idx%d" % archive]) for c in (a, b)]
    bad += mismatched + len(extra[0]) + len(extra[1]) + (idx_len[0] != idx_len[1])
    print(
        "idx%-3d groups %5d  payload mismatches %d  stored-bytes identical %5d  unlisted groups A/B %d/%d  idx bytes %d/%d  A %s  B %s"
        % (archive, len(ids), mismatched, same_bytes, len(extra[0]), len(extra[1]), idx_len[0], idx_len[1], dict(kinds[0]), dict(kinds[1]))
    )
print("files A:", sorted(a.files), "\nfiles B:", sorted(b.files))
print("RESULT:", "FAIL (%d problems)" % bad if bad else "OK, all %d groups decode identically" % sum(map(len, groups.values())))
sys.exit(1 if bad else 0)
