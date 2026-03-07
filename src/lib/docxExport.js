import { Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell, BorderStyle, WidthType } from 'docx';
import { saveAs } from 'file-saver';

/** Blob のみ生成して返す（保存処理なし） */
export const buildDocxBlob = async (fileName, content, context) => {
    const { schoolType, grade, subject, unitName, researchTheme, teacherFocus } = context;
    const doc = new Document({
        sections: [{
            properties: {},
            children: [
                new Paragraph({
                    children: [new TextRun({ text: `${unitName} 単元指導計画`, bold: true, size: 32 })],
                    spacing: { after: 400 },
                }),
                new Paragraph({
                    children: [new TextRun({ text: `校種: ${schoolType === 'elementary' ? '小学校' : '中学校'} / 学年: ${grade} / 教科: ${subject}`, size: 24 })],
                }),
                new Paragraph({ text: "" }),
                new Paragraph({ children: [new TextRun({ text: "【校内研究テーマ】", bold: true })] }),
                new Paragraph({ children: [new TextRun({ text: researchTheme || "なし" })], spacing: { after: 200 } }),
                new Paragraph({ children: [new TextRun({ text: "【先生のこだわり・重点】", bold: true, color: "E04F5F" })] }),
                new Paragraph({ children: [new TextRun({ text: teacherFocus || "なし" })], spacing: { after: 400 } }),
                new Paragraph({ children: [new TextRun({ text: "--- 生成された計画 ---", bold: true })], spacing: { after: 200 } }),
                ...content.split('\n').map(line => new Paragraph({ children: [new TextRun({ text: line })] })),
            ],
        }],
    });
    return await Packer.toBlob(doc);
};

export const exportToWord = async (fileName, content, context, folderHandle) => {
    const blob = await buildDocxBlob(fileName, content, context);
    const fullName = `${fileName}.docx`;

    // 保存先フォルダが指定されている場合 → 直接書き込み
    if (folderHandle) {
        try {
            const perm = await folderHandle.requestPermission({ mode: 'readwrite' });
            if (perm === 'granted') {
                const fileHandle = await folderHandle.getFileHandle(fullName, { create: true });
                const writable = await fileHandle.createWritable();
                await writable.write(blob);
                await writable.close();
                return { saved: true, folder: folderHandle.name };
            }
        } catch (err) {
            console.error('folder save failed:', err);
            // フォールバックへ
        }
    }

    // 保存先未指定 → showSaveFilePicker ダイアログ
    if (window.showSaveFilePicker) {
        try {
            const handle = await window.showSaveFilePicker({
                suggestedName: fullName,
                types: [{ description: 'Word Document', accept: { 'application/vnd.openxmlformats-officedocument.wordprocessingml.document': ['.docx'] } }],
            });
            const writable = await handle.createWritable();
            await writable.write(blob);
            await writable.close();
            return { saved: true, folder: null };
        } catch (err) {
            if (err.name !== 'AbortError') {
                saveAs(blob, fullName);
                return { saved: true, folder: null };
            }
            return { saved: false };
        }
    } else {
        saveAs(blob, fullName);
        return { saved: true, folder: null };
    }
};
