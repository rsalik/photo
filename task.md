Your task is to make a photography portfolio website. The goal is to have a beautiful, highly responsive website in a classy, timeless, but modern style. This document outlines the requirements and expectations for the project. Besides from the requirements outlined below, you are given creative liberty to design the website as you see fit.

# Tech Stack

- Front end: SvelteKit, TypeScript, Tailwind CSS
- Back end & Development: you are free to choose.
  - For local development, there should be local hosting.
  - For deployment, set up a back end tech stack that is easy to deploy and cheap.
- I do not want to pay for any services or AI tokens ideally.

# Photo Handling

- Photos should have rich metadata attached to them. Eg: Camera Model, Lens Model, Aperture, Shutter Speed, Focal Length, ISO, Timestamp, etc. You can extract this information from the EXIF data of the photos.
- Photos will be given custom metadata as well upon upload to the Admin Portal. This includes title, description (optional), location (optional), tags (optional), and albums (optional)
- Photos should be lazy loaded and display appropriate placeholders (4 sizes, eventually loading the full resolution, but displaying something in the interim).

# Pages

- Gallery: all photos, sorted by date (newest first). Can be filtered by EXIF metadata (e.g. shutter speed), custom metadata (e.g. albums). Photos should be displayed in a grid, but note that aspect ratios of each photo will vary, sometimes greatly. Arrange the photos in a way that is visually appealing (e.g. a masonry grid, or something else of your choosing). Photos should have a constant margin between them to maximize visual appeal. In the gallery view, photos should not be cropped. (USE YOUR JUDGEMENT HERE: If it is necessary a crop a photo slightly to make the gallery look coherent, then there can be some tolerance)
- Individual Photo View: the display for this page should vary based on the aspect ratio of the photo and the device.
  - If you have a match (e.g. phone and vertical photo, computer screen and horizontal photo), animate the Individual Photo View page thus:
    - When the page loads, the image should be centered and fill the entire width/height of the screen. The title of the image should animate in, in the center/center of the page (over the image). The text of the title should be one line and prominant on the page. The goal here is to create an animated effect that is reminiscent of a postcard.
      - The title text should have good contrast with the image. This means that different images should have different colored titles display here. This can be customized in the Admin Panel on a per-photo basis, but a detection algorithm should run during upload. This is an opportunity to pick a color that is accessible but also looks great for the specific photo. For landscape photography, yellow is a common text color for postcards, for example. White is another preferred pick (it looks good on photos of European cities, for example).
    - After a brief period of time, the title text should animate out, the image should animate to (remaining centered) a size that does not crop it at all (for example, a panoramic photo would have its sides chopped off in the beginning animation so that the height fills the screen, but now it should return to its natural width, leaving slight margins between the left and the right of the screen, and the natural letterboxing on top and bottom that results from its ultra-wide aspect ratio.)
    - As the image settles in its final position, the header and footer should animate in. The header should be minimalistic, while the footer contains the title and all metadata (EXIF, tags, etc., which also serve as links to the appropriate filtered gallery page). The footer should also contain little thumbnails of similar photos. Header and footer text should all be `text-color` or some similar variant (in other words, you can now disregard the title color from the animation).
  - If you do not have a match (e.g. phone and horizontal photo, computer screen and vertical photo), USE YOUR JUDGEMENT HERE, and accomplish a similar effect that fits the spirit of this project.
  - The Individual Photo View page should be accessible at `/photo/[id]`. You can decide if the id should be a title slug or UUID.
  - The Individual Photo View page should not scroll at all, and all the content (Header, Photo, Footer) should fit on one screen.

# UI

- Some elements of the UI have been discussed above. Be sure to follow those guidelines.
- The goal for the UI is to be classy, timeless, and modern, but not overly minimalistic. Good examples of this are The Masters (the Golf tournament), Ralph Lauren, or an ultra-luxury hotel like a Relais & Chateaux website.
- Avoid animations that are too "flashy" or "loud", and instead opt for more subtle, smooth animations.
- Keep a flat design.
- Use a light theme. `background-color` should be white or off-white, and the text color should be black or off-black.
- You may feel the need to choose an accent color. If so, choose a good one, and make it customizable from the Admin Portal.
- As much as possible, make the UI customizable from the Admin Portal.
- Use fonts installed on this computer. The specific vibe I'm going for can be accomplished with a serif, sans-serif, or even tasteful use of monospace fonts. A good serif font is Nib Pro. A good sans-serif font is Circular or Alliance Platt (sans-serif, especially for titles, might look best in all caps with wide le tter spacing). Use your judgement here, and maybe create multiple styles that can be selected from the Admin Portal.
- Make sure to check your work across multiple devices, and be sure that the website is fully responsive, and looks beautiful on all devices.

# Admin Portal

- The Admin Portal should implement all the above features that are mentioned above.
- For uploading photos, drag and drop functionality should be implemented.
- Ensure the Admin Portal is secure and only accessible to authorized users.
- Ensure the Admin Portal is responsive, optimized, and easy to use. Ease of use can be especially accomplished with great UI and keyboard shortcuts.
- Great emphasis should be placed on bulk photo uploads. It should be easy to upload many photos at once, assign them common tags, albums, or locations, etc. It should be easy to apply changes to groups of photos (instead of just all of them at once or one by one). You should be able to add/remove tags, add or remove photos from albums, change titles, delete, etc. Titles may forced to be unique if you choose.
- The admin panel should leverage local compute for certain tasks. For example, it should be able to process local photos for their metadata using a local tool (exiftool or similar). It should also generate the color palette for the title color. It should also generate the multiple sizes of the photos for the loading implementation. Any tech stack can be used for the admin panel, but if you decide to make it a web app, use SvelteKit, TypeScript, and Tailwind CSS. The admin panel does not necessarily have to be hosted if you think it shouldn't be. Alternatively, you can make it a part of the main web app as `/admin` if you desire. However, place emphasis on not paying for compute resources if you can avoid it.

If you are confused by any of my choices or specifications above, or notice a contradiction, let me know before getting started.
