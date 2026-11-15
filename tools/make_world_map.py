"""Makes the little map of the world that Giraffe's World Tour flies over.

It's made from Natural Earth's countries at 1:50 million, which are in the public domain (see CREDITS.md):

    python3 -I tools/make_world_map.py path/to/ne_50m_admin_0_countries.geojson

The file is downloaded by hand, into a folder of its own, from the natural-earth-vector repository
(geojson/ne_50m_admin_0_countries.geojson). This writes games/world-tour/world.json: for each country its
three-letter code, its name, its outlines as lists of longitude and latitude, and where its name goes.

The outlines are made simpler on the way, so the file is small and quick to draw: points that a line can do
without are left out, and so are the islands too small to see, though never a country's biggest piece.

Borders are drawn as the United Nations recognises them, which is not always how Natural Earth draws them:
Crimea is part of Ukraine, Kosovo of Serbia, the north of Cyprus of Cyprus, Somaliland of Somalia and Taiwan
of China. Abkhazia and South Ossetia are part of Georgia in Natural Earth already.
"""
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "games" / "world-tour" / "world.json"

# What Natural Earth draws apart, and whose it is.
PART_OF = {"KOS": "SRB", "CYN": "CYP", "SOL": "SOM", "TWN": "CHN"}
# A place inside the Crimea, to find its outline among Russia's.
CRIMEA = (34.1, 45.2)
# How far, in degrees, a point may be from the line that's drawn without it. Under a pixel, as near as the game goes.
FINE = 0.03
# The smallest island that's kept, in square degrees: about 15 km across.
SMALLEST = 0.02


def outlines(geometry):
    """The outer line of each piece of a country. The lakes inside are left out: the game doesn't need them."""
    pieces = geometry["coordinates"] if geometry["type"] == "MultiPolygon" else [geometry["coordinates"]]
    return [piece[0] for piece in pieces]


def inside(ring, x, y):
    hit = False
    for index in range(len(ring)):
        ax, ay = ring[index][:2]
        bx, by = ring[index - 1][:2]
        if (ay > y) != (by > y) and x < (bx - ax) * (y - ay) / (by - ay) + ax:
            hit = not hit
    return hit


def area(ring):
    return abs(sum(ring[i][0] * ring[i - 1][1] - ring[i - 1][0] * ring[i][1] for i in range(len(ring)))) / 2


def off_line(point, a, b):
    """How far a point is from the line between two others."""
    (px, py), (ax, ay), (bx, by) = point[:2], a[:2], b[:2]
    dx, dy = bx - ax, by - ay
    if dx == 0 and dy == 0:
        return ((px - ax) ** 2 + (py - ay) ** 2) ** 0.5
    along = max(0, min(1, ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy)))
    return ((px - ax - along * dx) ** 2 + (py - ay - along * dy) ** 2) ** 0.5


def simpler(ring):
    """An outline with the points left out that it can do without (Douglas and Peucker's way)."""
    if ring[0][:2] == ring[-1][:2]:
        ring = ring[:-1]
    if len(ring) < 8:
        return ring
    # A closed line has no ends, so it's cut in two at its first point and the one farthest from it.
    far = max(range(len(ring)), key=lambda n: (ring[n][0] - ring[0][0]) ** 2 + (ring[n][1] - ring[0][1]) ** 2)
    keep = {0, far}
    spans = [(0, far), (far, len(ring))]
    while spans:
        first, last = spans.pop()
        end = ring[last % len(ring)]
        worst, at = 0, None
        for n in range(first + 1, last):
            distance = off_line(ring[n], ring[first], end)
            if distance > worst:
                worst, at = distance, n
        if at is not None and worst > FINE:
            keep.add(at)
            spans.extend([(first, at), (at, last)])
    return [ring[n] for n in sorted(keep)]


def middle(ring):
    return [sum(point[0] for point in ring) / len(ring), sum(point[1] for point in ring) / len(ring)]


def main(source):
    features = json.loads(Path(source).read_text(encoding="utf-8"))["features"]
    countries = {}
    for feature in features:
        about = feature["properties"]
        code = about["ADM0_A3"]
        rings = outlines(feature["geometry"])
        label = [about.get("LABEL_X"), about.get("LABEL_Y")]
        countries[code] = {"id": code, "name": about["NAME_EN"] or about["NAME"], "rings": rings, "at": label}

    # The Crimea, from Russia's outlines to Ukraine's.
    theirs = countries["RUS"]["rings"]
    crimea = [ring for ring in theirs if inside(ring, *CRIMEA)]
    if len(crimea) != 1 or area(crimea[0]) > 6:
        raise SystemExit("The Crimea isn't an outline of its own in this file: look again before using it.")
    theirs.remove(crimea[0])
    countries["UKR"]["rings"].append(crimea[0])
    for code, owner in PART_OF.items():
        countries[owner]["rings"].extend(countries.pop(code)["rings"])

    out = []
    for country in sorted(countries.values(), key=lambda each: each["id"]):
        rings = sorted(country["rings"], key=area, reverse=True)
        rings = [simpler(ring) for n, ring in enumerate(rings) if n == 0 or area(ring) >= SMALLEST]
        rings = [ring for n, ring in enumerate(rings) if n == 0 or len(ring) >= 4]
        at = country["at"]
        if at[0] is None or at[1] is None:
            at = middle(rings[0])
        out.append({
            "id": country["id"],
            "name": country["name"],
            "at": [round(at[0], 2), round(at[1], 2)],
            # Longitude and latitude in turn, to two places, which is finer than the map is.
            "rings": [[round(value, 2) for point in ring for value in point[:2]] for ring in rings],
        })
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps({"countries": out}, ensure_ascii=False, separators=(",", ":")) + "\n", encoding="utf-8")
    points = sum(len(ring) // 2 for country in out for ring in country["rings"])
    print(f"{len(out)} countries, {points} points, {OUT.stat().st_size // 1024} KB -> {OUT.relative_to(ROOT)}")


if __name__ == "__main__":
    if len(sys.argv) != 2:
        raise SystemExit(__doc__)
    main(sys.argv[1])
