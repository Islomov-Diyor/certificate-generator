# Certificate Generation Configuration Guide

## How to Adjust Text Positions

The certificate generation function uses configurable coordinates to position text on your template. You can easily adjust these in `app.py` in the `generate_pdf_certificate` function.

## Text Position Configuration

In `app.py`, find the `TEXT_POSITIONS` dictionary (around line 300):

```python
TEXT_POSITIONS = {
    'recipient_name': (397, 450),      # (x, y) coordinates
    'specialization': (397, 520),
    'course_name': (397, 590),
    'teacher_name': (397, 660),
    'reg_number': (397, 730),
    'date': (397, 800),
    'qr_code': (397, 1000)             # Bottom of page
}
```

## Coordinate System

- **Origin (0, 0)**: Top-left corner of the certificate
- **X-axis**: Horizontal position (left to right)
- **Y-axis**: Vertical position (top to bottom)
- **A4 Size**: 794 x 1123 pixels (at 96 DPI)

## How to Find the Right Coordinates

1. **Open your template image** in an image editor (Paint, Photoshop, GIMP, etc.)
2. **Note the pixel coordinates** where you want each field:
   - Hover your mouse over the position
   - Check the coordinates in the status bar
3. **Update the coordinates** in `TEXT_POSITIONS`

## Example Adjustments

### If text is too high:
- **Decrease** the Y value (second number)
- Example: `(397, 450)` → `(397, 400)`

### If text is too low:
- **Increase** the Y value
- Example: `(397, 450)` → `(397, 500)`

### If text is too far left:
- **Increase** the X value (first number)
- Example: `(397, 450)` → `(450, 450)`

### If text is too far right:
- **Decrease** the X value
- Example: `(397, 450)` → `(350, 450)`

## Font Sizes

You can also adjust font sizes:

```python
FONT_SIZE_LARGE = 48      # For recipient name
FONT_SIZE_MEDIUM = 32     # For other fields
FONT_SIZE_SMALL = 24      # For date/reg number
```

## Text Color

Change text color (RGB values 0-255):

```python
TEXT_COLOR = (0, 0, 0)    # Black (default)
# TEXT_COLOR = (50, 50, 50)  # Dark gray
# TEXT_COLOR = (139, 69, 19)  # Brown
```

## QR Code Size

Adjust QR code size:

```python
qr_size = 150  # Change this value (in pixels)
```

## Testing

1. Generate a test certificate
2. Check if text positions match your template
3. Adjust coordinates as needed
4. Regenerate until perfect

## Tips

- **Start with recipient name**: Get this positioned correctly first
- **Use consistent spacing**: Keep 50-70 pixels between fields
- **Center alignment**: The code centers text horizontally automatically
- **Test with real data**: Use actual names to see how it looks

## Template Requirements

- **Format**: PNG or JPG recommended (PDF also supported)
- **Size**: A4 (210mm x 297mm or 794 x 1123 pixels)
- **Resolution**: 300 DPI for best quality
- **Background**: Should be the certificate design

## PDF Template Support

For PDF templates, you need to install `pdf2image`:

```bash
pip install pdf2image
```

**Note**: On Windows, you also need Poppler:
- Download from: https://github.com/oschwartz10612/poppler-windows/releases
- Extract and add to PATH, or place `poppler/bin` in your project folder

The code will work with image templates (PNG/JPG) even without pdf2image installed.





