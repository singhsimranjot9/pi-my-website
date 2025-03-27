from transformers import BlipProcessor, BlipForConditionalGeneration
from PIL import Image
import sys

# Load model once (can take a bit)
processor = BlipProcessor.from_pretrained("Salesforce/blip-image-captioning-base", use_fast=True)
model = BlipForConditionalGeneration.from_pretrained("Salesforce/blip-image-captioning-base")

# Get image path from Node.js
image_path = sys.argv[1]
image = Image.open(image_path).convert('RGB')

inputs = processor(images=image, return_tensors="pt")
out = model.generate(**inputs)
caption = processor.decode(out[0], skip_special_tokens=True)

print(caption)
