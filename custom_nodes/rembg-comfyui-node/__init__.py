from rembg import remove
from rembg.sessions import U2netCustomSession
from PIL import Image
import torch
import numpy as np
import os

# Created by wangminrui2022 on 2024-05-19.

# Tensor to PIL
def tensor2pil(image):
    return Image.fromarray(np.clip(255. * image.cpu().numpy().squeeze(), 0, 255).astype(np.uint8))

# Convert PIL to Tensor
def pil2tensor(image):
    return torch.from_numpy(np.array(image).astype(np.float32) / 255.0).unsqueeze(0)

class ImageRemoveBackgroundRembg:

    session=None
    def __init__(self):
        global session
        current_directory = os.path.dirname(os.path.abspath(__file__))
        model_path = os.path.join(current_directory, 'u2net/u2net.onnx')
        print(model_path)
        self.session = U2netCustomSession("u2net", {}, model_path=model_path)
    
    @classmethod
    def INPUT_TYPES(s):
        return {
            "required": {
                "image": ("IMAGE",),
            },
        }

    RETURN_TYPES = ("IMAGE",)
    FUNCTION = "remove_background"
    CATEGORY = "image"

    def remove_background(self, image):
        global session
        image = pil2tensor(remove(tensor2pil(image), session=self.session))
        return (image,)


# A dictionary that contains all nodes you want to export with their names
# NOTE: names should be globally unique
NODE_CLASS_MAPPINGS = {
    "Image Remove Background (rembg)": ImageRemoveBackgroundRembg
}
