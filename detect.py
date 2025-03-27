import sys
from ultralytics import YOLO

# Load the pretrained YOLOv8 model (nano is light and fast for Pi)
model = YOLO("yolov8n.pt")

# Get the image path from Node.js
image_path = sys.argv[1]

# Run detection
results = model(image_path)

# Get predicted classes
labels = results[0].names
detections = results[0].boxes.cls.tolist()  # Class IDs

# Convert IDs to label names
detected_labels = [labels[int(cls)] for cls in detections]
unique_labels = list(set(detected_labels))

# Output as comma-separated string
print(", ".join(unique_labels) if unique_labels else "No objects detected")
