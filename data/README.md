# Test data

Imaging data is **not committed to this repo**. Download a volume here and open it in the app; files
in this directory are gitignored.

Faraday reads NIfTI (`.nii`, `.nii.gz`). Everything below is public and de-identified.

## Recommended: UPENN-GBM

[`MedOtter/UPENN-GBM`](https://huggingface.co/datasets/MedOtter/UPENN-GBM) — **CC BY 4.0**

Brain mpMRI with expert tumour segmentations. The best fit here because every patient has four
sequences (T1, T1-Gd, T2, FLAIR) already co-registered onto an identical 240×240×155 1 mm isotropic
grid, so no resampling is needed to compare them. Expert masks give ground truth to check the
agent's measurements against, and the `_21` follow-up timepoints support interval-change comparison.

```bash
huggingface-cli download MedOtter/UPENN-GBM --repo-type dataset --local-dir . \
  --include "images_structural/UPENN-GBM-00001*"
```

## Small and fast

[`radiata-ai/brain-structure`](https://huggingface.co/datasets/radiata-ai/brain-structure) — ODC-By
1.0, individual scans under study-specific terms.

3,794 skull-stripped T1 scans at 113×137×113 (1.5 mm), MNI-aligned. The small volumes load
near-instantly, which makes them the better choice for screen recordings.

## Abdominal CT

[`MedOtter/msd-liver`](https://huggingface.co/datasets/MedOtter/msd-liver) — **CC BY-SA 4.0**

Liver and liver-tumour CT from the Medical Segmentation Decathlon. Note the share-alike term: if you
redistribute these volumes, the redistribution inherits CC BY-SA 4.0. That is why nothing here is
vendored into the repo, whose own code is MIT.

## Licensing note

These datasets carry their own licenses, separate from this repository's MIT license. Attribution
requirements travel with the data. Check each dataset card before redistributing anything.
