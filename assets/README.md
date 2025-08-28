# Game Assets

This directory should contain the following sprite images:

## Required Sprites

### wolf.png

- **Size**: Recommended 90x72 pixels (4:3.2 aspect ratio)
- **Style**: Cartoon/illustrated wolf character
- **Orientation**: Side view, facing right
- **Background**: Transparent or solid color that can be made transparent

### fox.png

- **Size**: Recommended 80x64 pixels (5:4 aspect ratio)
- **Style**: Cartoon/illustrated fox character
- **Orientation**: Side view, facing right
- **Background**: Transparent or solid color that can be made transparent

### rabbit.png

- **Size**: Recommended 64x51 pixels (5:4 aspect ratio)
- **Style**: Cartoon/illustrated rabbit character
- **Orientation**: Front view or side view (will be centered)
- **Background**: Transparent or solid color that can be made transparent

### carrot.png

- **Size**: Recommended 30x40 pixels (3:4 aspect ratio)
- **Style**: Cartoon/illustrated carrot with green leaves
- **Orientation**: Vertical, pointing up
- **Background**: Transparent or solid color that can be made transparent

### heart.png

- **Size**: Recommended 30x30 pixels (1:1 aspect ratio)
- **Style**: Cartoon/illustrated heart icon
- **Color**: Red or pink heart shape
- **Background**: Transparent or solid color that can be made transparent

## Fallback System

If these images are not found or fail to load, the game will automatically use cute cartoon fallback drawings:

- **Wolf fallback**: Rounded red body with pointy ears
- **Fox fallback**: Rounded brown body with bushy tail
- **Rabbit fallback**: Oval body with ears, eyes, and nose
- **Carrot fallback**: Orange triangle with green leaves
- **Heart fallback**: Red heart symbol (♥)

## Implementation Notes

- Images are automatically scaled to fit the game's sprite sizes
- Drop shadows are added programmatically
- Hitboxes are 20% smaller than the visual sprite for fair gameplay
- The game waits for all assets to load before starting

## Adding Your Own Sprites

1. Place your sprite images in this directory
2. Name them exactly: `wolf.png`, `fox.png`, `rabbit.png`, `carrot.png`, and `heart.png`
3. Ensure they have transparent backgrounds
4. The game will automatically use them when available
