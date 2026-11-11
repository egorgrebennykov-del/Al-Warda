from PIL import Image

im_raw_5333 = Image.open("scripts/temp_images/5333_raw.jpg")
print("5333 raw size:", im_raw_5333.size)

im_gen_5333 = Image.open("Al-Warda/public/assets/img/generated-products/7150ea11e34eca02b990c9daa739988b182c0a5b0d6bc91f6c28f7921a889ded.png")
print("5333 gen size:", im_gen_5333.size)

im_raw_5449 = Image.open("scripts/temp_images/5449_raw.jpg")
print("5449 raw size:", im_raw_5449.size)

im_gen_5449 = Image.open("Al-Warda/public/assets/img/generated-products/a5ec828d828f5a0553d3ce11e45ec15560d970847352e98489e77adfe07aac0a.png")
print("5449 gen size:", im_gen_5449.size)
