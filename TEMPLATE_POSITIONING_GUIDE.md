# Template Positioning System Guide

## Overview

The certificate generation system now supports **automatic placeholder detection (Option A)** and **manual template editor (Option B)** for positioning text fields on certificates.

## How It Works

### Option A: Automatic Placeholder Detection

When you upload a template, the system automatically tries to detect placeholder text like:
- `{{RECIPIENT_NAME}}` or `{{NAME}}`
- `{{SPECIALIZATION}}`
- `{{COURSE_NAME}}`
- `{{TEACHER_NAME}}`
- `{{REG_NUMBER}}`
- `{{DATE}}`

**If detection succeeds:** Positions are saved automatically, and you're ready to generate certificates!

**If detection fails:** You'll be redirected to the Template Editor (Option B) to set positions manually.

### Option B: Manual Template Editor

The Template Editor allows you to:
- See a preview of your template
- Click and drag red markers to position each field
- Set exact coordinates for each text field
- Save positions for future certificate generation

## Creating Templates with Placeholders

### Recommended Approach

1. **Design your template** in Canva, Photoshop, or any design tool
2. **Add placeholder text** where you want data to appear:
   ```
   {{RECIPIENT_NAME}}
   {{SPECIALIZATION}}
   {{COURSE_NAME}}
   {{TEACHER_NAME}}
   {{REG_NUMBER}}
   {{DATE}}
   ```
3. **Export as PNG** (recommended) or JPG
4. **Upload** the template

### Placeholder Options

The system recognizes multiple placeholder formats:

**Recipient Name:**
- `{{RECIPIENT_NAME}}`
- `{{NAME}}`
- `{{RECIPIENT}}`
- `[NAME]`
- `[RECIPIENT]`

**Specialization:**
- `{{SPECIALIZATION}}`
- `{{SPEC}}`
- `[SPECIALIZATION]`

**Course Name:**
- `{{COURSE_NAME}}`
- `{{COURSE}}`
- `[COURSE]`

**Teacher Name:**
- `{{TEACHER_NAME}}`
- `{{TEACHER}}`
- `[TEACHER]`

**Registration Number:**
- `{{REG_NUMBER}}`
- `{{REG}}`
- `{{REGISTRATION}}`
- `[REG_NUMBER]`

**Date:**
- `{{DATE}}`
- `{{ISSUE_DATE}}`
- `[DATE]`

## Using the Template Editor

### Accessing the Editor

1. Go to **Templates** → **Template Management**
2. Click the **gear icon** (⚙️) next to any template
3. Or, upload a new template without placeholders (you'll be redirected automatically)

### Editor Features

- **Visual Preview:** See your template with position markers
- **Drag & Drop:** Click and drag red markers to position fields
- **Coordinate Input:** Manually enter X/Y coordinates
- **Real-time Updates:** Markers move as you type coordinates

### Positioning Guidelines

- **Registration Number:** Should be at **top center**
- **QR Code:** Should be at **bottom right**
- **Other Fields:** Position as needed for your design

## Workflow

### First Time Setup

1. **Upload Template** with placeholders OR without
2. **If placeholders detected:** ✅ Ready to use!
3. **If not detected:** Use Template Editor to set positions
4. **Save positions**

### Generating Certificates

1. Select template
2. Fill in certificate details
3. Generate certificate
4. System uses stored positions to place text correctly

## Tips

### For Best Results

1. **Use PNG format** - Better quality and easier to work with
2. **High resolution** - 300 DPI recommended
3. **A4 size** - 210mm x 297mm (794 x 1123 pixels at 96 DPI)
4. **Clear placeholders** - Use bold, visible text for placeholders
5. **Test positions** - Generate a test certificate to verify

### Template Design Tips

- Make placeholders **clearly visible** (bold, large font)
- Use **consistent placeholder format** (e.g., all `{{FIELD_NAME}}`)
- Leave **enough space** around placeholders for text
- Consider **text length** - names can vary in length

## Troubleshooting

### Placeholders Not Detected?

- Check placeholder format matches supported options
- Ensure placeholders are visible (not too small)
- Use Template Editor as backup

### Text Not Positioning Correctly?

- Use Template Editor to fine-tune positions
- Generate test certificate to verify
- Adjust coordinates as needed

### QR Code Position Wrong?

- Default is bottom right
- Adjust in Template Editor if needed
- Coordinates: X = right edge, Y = bottom edge

## Technical Details

### Coordinate System

- **Origin (0,0):** Top-left corner
- **X-axis:** Horizontal (left to right)
- **Y-axis:** Vertical (top to bottom)
- **A4 Size:** 794 x 1123 pixels (at 96 DPI)

### Storage

Positions are stored as JSON in the database:
```json
{
  "recipient_name": {"x": 397, "y": 450},
  "specialization": {"x": 397, "y": 520},
  "qr_code": {"x": 650, "y": 1000}
}
```

## Next Steps

1. **Upload your first template** with placeholders
2. **Test automatic detection**
3. **Use editor if needed** to fine-tune
4. **Generate test certificates** to verify
5. **Adjust as needed**

The system is now ready to use! 🎉


