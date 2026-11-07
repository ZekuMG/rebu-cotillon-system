from __future__ import annotations

import argparse
import csv
import json
import math
import sys
from collections import Counter
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "output" / ".deps" / "opencv"))

import cv2
import numpy as np
from PIL import Image, ImageDraw, ImageFont


IMAGE_EXTENSIONS = {".png", ".jpg", ".jpeg", ".webp", ".bmp", ".tif", ".tiff"}
ORB = cv2.ORB_create(
    nfeatures=1600,
    scaleFactor=1.18,
    nlevels=10,
    edgeThreshold=12,
    firstLevel=0,
    WTA_K=2,
    scoreType=cv2.ORB_HARRIS_SCORE,
    patchSize=31,
    fastThreshold=5,
)


def read_gray(path: Path) -> np.ndarray:
    data = np.fromfile(path, dtype=np.uint8)
    image = cv2.imdecode(data, cv2.IMREAD_COLOR)
    if image is None:
        raise ValueError(f"Cannot decode {path}")
    height, width = image.shape[:2]
    scale = min(1.0, 900 / max(height, width))
    if scale < 1:
        image = cv2.resize(image, (round(width * scale), round(height * scale)), interpolation=cv2.INTER_AREA)
    gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)
    return cv2.equalizeHist(gray)


def descriptors(path: Path) -> tuple[list, np.ndarray | None]:
    return ORB.detectAndCompute(read_gray(path), None)


def direct_score(query: tuple[list, np.ndarray | None], train: tuple[list, np.ndarray | None]) -> dict:
    query_points, query_descriptors = query
    train_points, train_descriptors = train
    if query_descriptors is None or train_descriptors is None:
        return {"good": 0, "inliers": 0, "coverage": 0.0, "score": 0.0}

    matcher = cv2.BFMatcher(cv2.NORM_HAMMING, crossCheck=False)
    pairs = matcher.knnMatch(query_descriptors, train_descriptors, k=2)
    good = [pair[0] for pair in pairs if len(pair) == 2 and pair[0].distance < 0.74 * pair[1].distance]
    inliers = 0
    if len(good) >= 5:
        source_points = np.float32([query_points[item.queryIdx].pt for item in good]).reshape(-1, 1, 2)
        target_points = np.float32([train_points[item.trainIdx].pt for item in good]).reshape(-1, 1, 2)
        _, mask = cv2.findHomography(source_points, target_points, cv2.RANSAC, 5.0)
        if mask is not None:
            inliers = int(mask.sum())

    coverage = len(good) / max(1, min(len(query_points), len(train_points)))
    inlier_ratio = inliers / max(1, len(good))
    score = inliers + 0.30 * len(good) + 35.0 * coverage + 4.0 * inlier_ratio
    return {
        "good": len(good),
        "inliers": inliers,
        "coverage": round(coverage, 6),
        "inlier_ratio": round(inlier_ratio, 6),
        "score": round(score, 6),
    }


def classify(best: dict, second: dict) -> str:
    margin = best["score"] - second["score"]
    if best["inliers"] >= 22 and best["inlier_ratio"] >= 0.28 and margin >= 5:
        return "strong"
    if best["inliers"] >= 12 and best["inlier_ratio"] >= 0.22 and margin >= 3:
        return "probable"
    if best["inliers"] >= 7 and best["good"] >= 12:
        return "possible"
    return "review"


def preselect(reference_features: list[tuple[list, np.ndarray | None]], matcher, limit: int = 24) -> list[int]:
    votes: Counter[int] = Counter()
    for _, query_descriptors in reference_features:
        if query_descriptors is None:
            continue
        for neighbours in matcher.knnMatch(query_descriptors, k=4):
            if not neighbours:
                continue
            best = neighbours[0]
            if best.distance <= 62:
                votes[best.imgIdx] += max(0.05, (70.0 - best.distance) / 70.0)
            for extra in neighbours[1:]:
                if extra.distance <= 48:
                    votes[extra.imgIdx] += max(0.02, (52.0 - extra.distance) / 104.0)
    return [index for index, _ in votes.most_common(limit)]


def load_rgb(path: Path) -> Image.Image:
    with Image.open(path) as source:
        image = source.convert("RGBA")
    white = Image.new("RGBA", image.size, (255, 255, 255, 255))
    white.alpha_composite(image)
    return white.convert("RGB")


def thumbnail(path: Path, size: tuple[int, int]) -> Image.Image:
    image = load_rgb(path)
    image.thumbnail(size, Image.Resampling.LANCZOS)
    canvas = Image.new("RGB", size, "white")
    canvas.paste(image, ((size[0] - image.width) // 2, (size[1] - image.height) // 2))
    return canvas


def clip(text: str, length: int = 34) -> str:
    return text if len(text) <= length else text[: length - 1] + "…"


def sheets(rows: list[dict], output_dir: Path, page_size: int = 16) -> list[str]:
    output_dir.mkdir(parents=True, exist_ok=True)
    font = ImageFont.load_default()
    cell_w, image_h, label_h = 260, 190, 64
    row_h = image_h + label_h
    output_paths = []
    for page_number, start in enumerate(range(0, len(rows), page_size), 1):
        page_rows = rows[start : start + page_size]
        sheet = Image.new("RGB", (cell_w * 4, 34 + row_h * len(page_rows)), "#eeeeee")
        draw = ImageDraw.Draw(sheet)
        for col, title in enumerate(("ORIGINAL", "CANDIDATO 1", "CANDIDATO 2", "CANDIDATO 3")):
            draw.text((col * cell_w + 8, 10), title, fill="black", font=font)
        for row_index, row in enumerate(page_rows):
            top = 34 + row_index * row_h
            paths = [Path(row["source"])] + [Path(candidate["path"]) for candidate in row["candidates"][:3]]
            for col, path in enumerate(paths):
                left = col * cell_w
                sheet.paste(thumbnail(path, (cell_w - 8, image_h - 8)), (left + 4, top + 4))
                if col == 0:
                    label = f'{row["id"]} {clip(row["title"])}'
                    detail = f'{row["status"]}'
                else:
                    candidate = row["candidates"][col - 1]
                    label = clip(path.name)
                    detail = f's={candidate["score"]:.1f} in={candidate["inliers"]} good={candidate["good"]}'
                draw.text((left + 6, top + image_h + 4), label, fill="black", font=font)
                draw.text((left + 6, top + image_h + 22), detail, fill="#333333", font=font)
            draw.line((0, top + row_h - 1, cell_w * 4, top + row_h - 1), fill="#999999")
        destination = output_dir / f"orb-matches-{page_number:02d}.jpg"
        sheet.save(destination, quality=90, optimize=True)
        output_paths.append(str(destination))
    return output_paths


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--archive-dir", type=Path, required=True)
    parser.add_argument("--selection", type=Path, required=True)
    parser.add_argument("--output-dir", type=Path, required=True)
    args = parser.parse_args()
    args.output_dir.mkdir(parents=True, exist_ok=True)

    selection = json.loads(args.selection.read_text(encoding="utf-8"))
    archive_paths = sorted(
        path for path in args.archive_dir.rglob("*") if path.is_file() and path.suffix.lower() in IMAGE_EXTENSIONS
    )
    archive_features = {path: descriptors(path) for path in archive_paths}
    matcher = cv2.FlannBasedMatcher(
        {"algorithm": 6, "table_number": 12, "key_size": 20, "multi_probe_level": 2},
        {"checks": 64},
    )
    matcher.add([archive_features[path][1] for path in archive_paths])
    matcher.train()

    rows = []
    for target in selection["targets"]:
        reference_paths = [Path(target["source_file"])]
        final_path = Path(target["final_output"])
        if final_path.exists():
            reference_paths.append(final_path)
        reference_features = [descriptors(path) for path in reference_paths]

        candidates = []
        candidate_indexes = preselect(reference_features, matcher)
        if len(candidate_indexes) < 3:
            candidate_indexes = list(range(len(archive_paths)))
        for archive_index in candidate_indexes:
            archive_path = archive_paths[archive_index]
            archive_feature = archive_features[archive_path]
            variants = [direct_score(reference, archive_feature) for reference in reference_features]
            result = max(variants, key=lambda item: item["score"])
            candidates.append({"path": str(archive_path), **result})
        candidates.sort(key=lambda item: item["score"], reverse=True)
        status = classify(candidates[0], candidates[1])
        rows.append(
            {
                "id": str(target["id"]),
                "title": target["title"],
                "source": target["source_file"],
                "status": status,
                "margin": round(candidates[0]["score"] - candidates[1]["score"], 6),
                "candidates": candidates[:5],
            }
        )

    report = {
        "archive_image_count": len(archive_paths),
        "target_count": len(rows),
        "automatic_status_counts": dict(Counter(row["status"] for row in rows)),
        "matches": rows,
    }
    report_path = args.output_dir / "orb-match-report.json"
    report_path.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")

    csv_path = args.output_dir / "orb-match-report.csv"
    with csv_path.open("w", encoding="utf-8-sig", newline="") as handle:
        writer = csv.writer(handle)
        writer.writerow(["id", "title", "status", "margin", "candidate", "score", "inliers", "good"])
        for row in rows:
            candidate = row["candidates"][0]
            writer.writerow([row["id"], row["title"], row["status"], row["margin"], candidate["path"], candidate["score"], candidate["inliers"], candidate["good"]])

    sheet_paths = sheets(rows, args.output_dir / "qa")
    print(json.dumps({"report": str(report_path), "csv": str(csv_path), "sheets": sheet_paths, "counts": report["automatic_status_counts"]}, ensure_ascii=False))


if __name__ == "__main__":
    main()
