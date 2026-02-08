import { Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell, BorderStyle, WidthType } from 'docx';
import { saveAs } from 'file-saver';

export const exportToWord = async (fileName, content, context) => {
    const { schoolType, grade, subject, unitName, researchTheme, teacherFocus } = context;

    // Split content into parseable sections (simple markdown parsing)
    // This is a basic implementation. For complex MD, a library or more robust parser is needed.
    // Here we assume the Gemini output format:
    // 1. **Title**
    // Content...

    const doc = new Document({
        sections: [{
            properties: {},
            children: [
                new Paragraph({
                    children: [
                        new TextRun({
                            text: `${unitName} 単元指導計画`,
                            bold: true,
                            size: 32,
                        }),
                    ],
                    spacing: { after: 400 },
                }),
                new Paragraph({
                    children: [
                        new TextRun({ text: `校種: ${schoolType === 'elementary' ? '小学校' : '中学校'} / 学年: ${grade} / 教科: ${subject}`, size: 24 }),
                    ],
                }),
                new Paragraph({ text: "" }), // Spacing

                // Research Theme Box
                new Paragraph({
                    children: [new TextRun({ text: "【校内研究テーマ】", bold: true })],
                }),
                new Paragraph({
                    children: [new TextRun({ text: researchTheme || "なし" })],
                    spacing: { after: 200 },
                }),

                // Teacher Focus Box
                new Paragraph({
                    children: [new TextRun({ text: "【先生のこだわり・重点】", bold: true, color: "E04F5F" })],
                }),
                new Paragraph({
                    children: [new TextRun({ text: teacherFocus || "なし" })],
                    spacing: { after: 400 },
                }),

                // Main Content (Raw dumping for now, as robust MD to Docx is complex)
                // Ideally we would parse the markdown table here.
                new Paragraph({
                    children: [new TextRun({ text: "--- 生成された計画 ---", bold: true })],
                    spacing: { after: 200 },
                }),
                ...content.split('\n').map(line => new Paragraph({
                    children: [new TextRun({ text: line })],
                })),
            ],
        }],
    });

    const blob = await Packer.toBlob(doc);

    // Use File System Access API if available for "Specify Folder"
    if (window.showSaveFilePicker) {
        try {
            const handle = await window.showSaveFilePicker({
                suggestedName: `${fileName}.docx`,
                types: [{
                    description: 'Word Document',
                    accept: { 'application/vnd.openxmlformats-officedocument.wordprocessingml.document': ['.docx'] },
                }],
            });
            const writable = await handle.createWritable();
            await writable.write(blob);
            await writable.close();
            return true;
        } catch (err) {
            if (err.name !== 'AbortError') {
                console.error(err);
                // Fallback to auto-download if picker fails or not supported/cancelled
                saveAs(blob, `${fileName}.docx`);
                return true;
            }
            return false; // User cancelled
        }
    } else {
        // Fallback for browsers without File System Access API
        saveAs(blob, `${fileName}.docx`);
        return true;
    }
};
