# Training on Google Colab (Free GPU) — Recommended

Training YOLO on your laptop's CPU can take many hours. Google Colab gives a
free GPU that trains the same model in ~15-30 minutes. Recommended for this project.

## Steps

1. Zip your merged dataset folder:
   `datasets/sentinel_dataset/` → `sentinel_dataset.zip`
   (this will likely be several GB given 24,900+ images — that's fine)

2. Upload `sentinel_dataset.zip` to your Google Drive (drive.google.com → My Drive →
   drag and drop the zip). This can take a while depending on your internet speed —
   let it fully finish uploading before moving on.

3. Go to https://colab.research.google.com → New Notebook

4. In Colab, set Runtime → Change runtime type → GPU (T4 is free tier)

5. Run these cells in Colab, one at a time:

```python
# Cell 1: mount your Google Drive
from google.colab import drive
drive.mount('/content/drive')
```
(A popup will ask you to authorize — click through it with your Google account.)

```python
# Cell 2: install
!pip install ultralytics -q
```

```python
# Cell 3: unzip your dataset directly from Drive into Colab's local disk
# (training reads much faster from local disk than from Drive directly)
!unzip -q "/content/drive/MyDrive/sentinel_dataset.zip" -d /content/sentinel_dataset
```
(Adjust the path if you put the zip in a subfolder of Drive, e.g.
`/content/drive/MyDrive/MajorProject/sentinel_dataset.zip`)

```python
# Cell 4: fix data.yaml paths to point at Colab's /content path
import yaml, glob

# find the data.yaml wherever unzip placed it (folder structure may nest one level)
yaml_path = glob.glob('/content/sentinel_dataset/**/data.yaml', recursive=True)[0]
base = yaml_path.rsplit('/data.yaml', 1)[0]

with open(yaml_path) as f:
    data = yaml.safe_load(f)
data['train'] = f'{base}/train/images'
data['val'] = f'{base}/valid/images'
data['test'] = f'{base}/test/images'
with open(yaml_path, 'w') as f:
    yaml.dump(data, f)

print("Using data.yaml at:", yaml_path)
print(data)
```

```python
# Cell 5: train (uses the data.yaml path found in Cell 4)
from ultralytics import YOLO
model = YOLO('yolo11n.pt')
results = model.train(
    data=yaml_path,
    epochs=50,
    imgsz=640,
    batch=16,
    name='sentinel_yolo11_run1',
)
```

```python
# Cell 6: evaluate (copy these numbers into your project report)
metrics = model.val()
print("mAP50:", metrics.box.map50)
print("mAP50-95:", metrics.box.map)
print("Precision:", metrics.box.mp)
print("Recall:", metrics.box.mr)
```

```python
# Cell 7: save the trained model straight to your Drive (safer than local download
# for a multi-hour Colab session — avoids losing it if the browser disconnects)
!cp /content/runs/detect/sentinel_yolo11_run1/weights/best.pt "/content/drive/MyDrive/sentinel_yolo11.pt"
print("Saved to Google Drive as sentinel_yolo11.pt")
```

6. Download `sentinel_yolo11.pt` from your Google Drive to your computer, and place it in:
   `ai-service/models/sentinel_yolo11.pt`

7. In `ai-service/app/main.py`, change the model_path back to:
   `model_path="models/sentinel_yolo11.pt"`

## Note on training time
With ~25,000 images across 6 classes, 50 epochs on a free T4 GPU could take
roughly 1.5–3 hours (not 15-30 minutes as with a small dataset). Colab's free
tier may disconnect after a few hours of inactivity — keep the browser tab
open and check on it periodically. If it disconnects partway, you can resume
training from the last checkpoint saved under `runs/detect/sentinel_yolo_run1/weights/last.pt`.
