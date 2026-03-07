import React, { useState, useEffect, useRef } from 'react';
import { useApiKeyBridge } from '../hooks/useApiKeyBridge';
import { BookOpen, Settings, School, GraduationCap, FileText, Upload, Sparkles, AlertCircle, Save, Heart, X, File as FileIcon, Mic, MicOff, ChevronRight, CheckCircle2, User, MessageCircle, Send, ChevronDown, ChevronUp, RotateCcw, Zap, History, FolderOpen, FolderX } from 'lucide-react';

// ───────────────────────────────────────────
// IndexedDB helpers for FileSystemDirectoryHandle persistence
// ───────────────────────────────────────────
const IDB_NAME = 'unitplan_db';
const IDB_STORE = 'handles';
function openIDB() {
    return new Promise((resolve, reject) => {
        const req = indexedDB.open(IDB_NAME, 1);
        req.onupgradeneeded = () => req.result.createObjectStore(IDB_STORE);
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
    });
}
async function saveHandleIDB(handle) {
    const db = await openIDB();
    return new Promise((resolve, reject) => {
        const tx = db.transaction(IDB_STORE, 'readwrite');
        tx.objectStore(IDB_STORE).put(handle, 'saveFolder');
        tx.oncomplete = resolve;
        tx.onerror = () => reject(tx.error);
    });
}
async function loadHandleIDB() {
    try {
        const db = await openIDB();
        return new Promise((resolve, reject) => {
            const tx = db.transaction(IDB_STORE, 'readonly');
            const req = tx.objectStore(IDB_STORE).get('saveFolder');
            req.onsuccess = () => resolve(req.result || null);
            req.onerror = () => reject(req.error);
        });
    } catch { return null; }
}
async function clearHandleIDB() {
    const db = await openIDB();
    return new Promise((resolve, reject) => {
        const tx = db.transaction(IDB_STORE, 'readwrite');
        tx.objectStore(IDB_STORE).delete('saveFolder');
        tx.oncomplete = resolve;
        tx.onerror = () => reject(tx.error);
    });
}
import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '../lib/utils';
import mammoth from 'mammoth';
import { exportToWord } from '../lib/docxExport';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { saveAs } from 'file-saver';

// 先生パーソナライズ質問項目
const TEACHER_QUESTIONS = [
    {
        key: 'philosophy',
        label: '授業観・学習観',
        question: 'あなたが大切にしている授業観・学習観を教えてください',
        placeholder: '例：子どもが主体的に問いを立て、仲間と協働して解決していく授業を大切にしています。',
        icon: '🌱'
    },
    {
        key: 'goalChild',
        label: 'めざす子ども像',
        question: 'この単元を通してどんな子どもに育てたいですか？',
        placeholder: '例：自分の考えを根拠をもって伝え、友達の意見から学べる子ども。',
        icon: '🌟'
    },
    {
        key: 'classReality',
        label: 'クラスの実態',
        question: '今のクラスの様子（強み・課題・気になること）を教えてください',
        placeholder: '例：積極的に発言する子が多い一方、書くことへの抵抗感が強い子が数名います。',
        icon: '👥'
    },
    {
        key: 'approach',
        label: '重視する指導の手立て',
        question: 'よく使う授業スタイル・工夫・手法はありますか？',
        placeholder: '例：ICTを活用した協働学習、Think-Pair-Share法を多用しています。',
        icon: '🛠️'
    },
    {
        key: 'evaluation',
        label: '評価へのこだわり',
        question: '評価で特に大切にしていることを教えてください',
        placeholder: '例：ペーパーテストより、振り返り日記やポートフォリオで成長を見取りたい。',
        icon: '📊'
    },
    {
        key: 'freeNote',
        label: 'その他・AIへ一言',
        question: 'AIに特に伝えたいこと、補足があれば自由に書いてください',
        placeholder: '例：ICT活用を強調してほしい／子どもが「書く」活動を中心にした展開にしてほしい など',
        icon: '💬'
    },
];

// ───────────────────────────────────────────
// ライン差分アルゴリズム（外部ライブラリ不要）
// ───────────────────────────────────────────
function lineDiff(oldStr, newStr) {
    const oldLines = (oldStr || '').split('\n');
    const newLines = (newStr || '').split('\n');
    const result = [];
    let o = 0, n = 0;

    while (o < oldLines.length || n < newLines.length) {
        if (o >= oldLines.length) {
            result.push({ type: 'added', line: newLines[n++] });
        } else if (n >= newLines.length) {
            result.push({ type: 'removed', line: oldLines[o++] });
        } else if (oldLines[o] === newLines[n]) {
            result.push({ type: 'unchanged', line: oldLines[o] });
            o++; n++;
        } else {
            // 前方5行以内で一致する行を探す
            let inNew = -1, inOld = -1;
            for (let k = 1; k <= 5; k++) {
                if (inNew === -1 && n + k < newLines.length && newLines[n + k] === oldLines[o]) inNew = k;
                if (inOld === -1 && o + k < oldLines.length && oldLines[o + k] === newLines[n]) inOld = k;
            }
            if (inNew !== -1 && (inOld === -1 || inNew <= inOld)) {
                for (let k = 0; k < inNew; k++) result.push({ type: 'added', line: newLines[n++] });
            } else if (inOld !== -1) {
                for (let k = 0; k < inOld; k++) result.push({ type: 'removed', line: oldLines[o++] });
            } else {
                result.push({ type: 'removed', line: oldLines[o++] });
                result.push({ type: 'added', line: newLines[n++] });
            }
        }
    }
    return result;
}

function countChanges(diff) {
    return {
        added:   diff.filter(d => d.type === 'added').length,
        removed: diff.filter(d => d.type === 'removed').length,
    };
}

// AI修正クイックチップ
const QUICK_CHIPS = [
    { label: '📝 板書計画を追加', instruction: '各授業時の板書計画（まとめ・キーワード）を追加してください。' },
    { label: '👥 グループ活動を強化', instruction: 'グループ活動・協働学習の場面をより多く・具体的にしてください。' },
    { label: '💻 ICT活用を追加', instruction: 'ICTを活用する場面を具体的に追加してください。' },
    { label: '📊 評価規準を詳しく', instruction: '評価規準をより詳細に、具体的な評価方法も含めて書き直してください。' },
    { label: '🤝 特支の手立てを強化', instruction: '特別な支援が必要な子どもへの手立て・配慮を具体的に充実させてください。' },
    { label: '➕ 授業時数を1時間追加', instruction: '授業時数を1時間追加して、その内容も適切に設計してください。' },
    { label: '🔗 研究テーマとの整合性確認', instruction: '研究テーマとの整合性を確認し、より明確につながりが見える計画に修正してください。' },
    { label: '✍️ 単元設定の理由を充実', instruction: '単元設定の理由をより豊かに、子どもの実態や教材の意義を含めて書き直してください。' },
    { label: '🗣️ 問い・言語活動を強化', instruction: '子どもが主体的に問いを立て、言語活動が充実するよう計画を修正してください。' },
    { label: '⏱️ 授業時数を1時間削減', instruction: '授業時数を1時間削減し、学習の流れが自然になるよう調整してください。' },
];

const PlanGenerator = () => {
    const { apiKey, saveApiKey } = useApiKeyBridge();
    const setApiKey = saveApiKey; // 既存コードとの互換性を保つ
    const [showSettings, setShowSettings] = useState(false);
    const [aiEnabled, setAiEnabled] = useState(() =>
        localStorage.getItem('unitplan_ai_enabled') !== 'false'
    );
    const [model, setModel] = useState('gemini-1.5-flash'); // Default stable model
    const [availableModels, setAvailableModels] = useState([
        { name: 'gemini-1.5-flash', displayName: 'Gemini 1.5 Flash (推奨)' },
        { name: 'gemini-1.5-pro', displayName: 'Gemini 1.5 Pro' },
        { name: 'gemini-2.0-flash', displayName: 'Gemini 2.0 Flash' },
    ]);
    const [connectionStatus, setConnectionStatus] = useState('idle'); // idle, testing, success, error

    // Context State
    const [schoolType, setSchoolType] = useState('elementary');
    const [grade, setGrade] = useState('');
    const [subject, setSubject] = useState('');
    const [classType, setClassType] = useState('regular');
    const [unitName, setUnitName] = useState('');

    // 先生パーソナライズ
    const [teacherProfile, setTeacherProfile] = useState(() => {
        const saved = localStorage.getItem('unitplan_teacher_profile');
        return saved ? JSON.parse(saved) : {};
    });
    const [showTeacherModal, setShowTeacherModal] = useState(false);
    const [listeningKey, setListeningKey] = useState(null); // 録音中のフィールドキー
    const recognitionRef = useRef(null);

    // 研究構想図・研究資料
    const [researchFiles, setResearchFiles] = useState([]);       // PDF: { name, mimeType, data (base64) }
    const [researchTextContent, setResearchTextContent] = useState(''); // Word → 抽出テキスト
    const researchFileInputRef = useRef(null);

    // 学習指導要領・教材資料
    const [guideContent, setGuideContent] = useState('');
    const [attachedFiles, setAttachedFiles] = useState([]);
    const fileInputRef = useRef(null);
    const previewRef = useRef(null);

    // Generation State
    const [generatedPlan, setGeneratedPlan] = useState('');
    const [isLoading, setIsLoading] = useState(false);

    // AI修正チャット
    const [chatMessages, setChatMessages] = useState([]);
    const [chatInput, setChatInput] = useState('');
    const [isChatOpen, setIsChatOpen] = useState(false);
    const [isChatLoading, setIsChatLoading] = useState(false);
    const chatEndRef = useRef(null);

    // レイアウトモード: 'design'（入力） | 'refine'（精錬）
    const [layoutMode, setLayoutMode] = useState('design');

    // 変更履歴
    const [planHistory, setPlanHistory] = useState([]); // [{id, ts, plan, label}]
    const [showHistoryModal, setShowHistoryModal] = useState(false);
    const [diffTarget, setDiffTarget] = useState(null); // 差分表示するhistory index

    // 保存先フォルダ
    const [folderHandle, setFolderHandle] = useState(null);
    const [folderName, setFolderName] = useState(() => localStorage.getItem('unitplan_folder_name') || '');

    // teacherProfile の1フィールドを更新
    const updateTeacherProfile = (key, value) => {
        setTeacherProfile(prev => ({ ...prev, [key]: value }));
    };

    // teacherProfile を localStorage に保存してモーダルを閉じる
    const applyTeacherProfile = () => {
        localStorage.setItem('unitplan_teacher_profile', JSON.stringify(teacherProfile));
        stopVoice();
        setShowTeacherModal(false);
    };

    // 音声入力の開始・停止
    const toggleVoice = (key) => {
        const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
        if (!SpeechRecognition) {
            alert('このブラウザは音声入力に対応していません。Chrome または Edge をお使いください。');
            return;
        }

        // 同じキーをもう一度押したら停止
        if (listeningKey === key) {
            stopVoice();
            return;
        }

        // 別のフィールドが録音中なら停止してから開始
        stopVoice();

        const recognition = new SpeechRecognition();
        recognition.lang = 'ja-JP';
        recognition.continuous = true;
        recognition.interimResults = true;
        recognitionRef.current = recognition;
        setListeningKey(key);

        let finalText = teacherProfile[key] || '';

        recognition.onresult = (event) => {
            let interim = '';
            for (let i = event.resultIndex; i < event.results.length; i++) {
                const transcript = event.results[i][0].transcript;
                if (event.results[i].isFinal) {
                    finalText += transcript;
                    updateTeacherProfile(key, finalText);
                } else {
                    interim = transcript;
                    updateTeacherProfile(key, finalText + interim);
                }
            }
        };

        recognition.onend = () => {
            setListeningKey(null);
            recognitionRef.current = null;
        };

        recognition.onerror = () => {
            setListeningKey(null);
            recognitionRef.current = null;
        };

        recognition.start();
    };

    const stopVoice = () => {
        if (recognitionRef.current) {
            recognitionRef.current.stop();
            recognitionRef.current = null;
        }
        setListeningKey(null);
    };

    // 入力済み項目数
    const filledCount = TEACHER_QUESTIONS.filter(q => teacherProfile[q.key]?.trim()).length;

    // 履歴に保存
    const saveToHistory = (plan, label) => {
        setPlanHistory(prev => [...prev, { id: Date.now(), ts: new Date(), plan, label }]);
    };

    // チャット送信でAI修正
    const handleChatSend = async (instruction) => {
        const text = (instruction || chatInput).trim();
        if (!text || !generatedPlan) return;
        if (!aiEnabled || !apiKey) {
            alert('AIがOFFまたはAPIキー未設定です。');
            return;
        }

        const userMsg = { role: 'user', content: text };
        setChatMessages(prev => [...prev, userMsg]);
        setChatInput('');
        setIsChatLoading(true);
        setIsChatOpen(true);

        // スクロール
        setTimeout(() => chatEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 50);

        try {
            const prompt = `以下は現在作成中の単元指導計画です：

${generatedPlan}

---
ユーザーからの修正依頼：「${text}」

上記の修正依頼に従い、単元指導計画を修正してください。
修正後の完全な計画のみをMarkdown形式で出力してください。説明文・前置きは一切不要です。`;

            const res = await fetch(
                `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
                {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] })
                }
            );
            const data = await res.json();
            if (data.error) throw new Error(data.error.message);

            const revised = data.candidates[0].content.parts[0].text;
            saveToHistory(revised, text.length > 18 ? text.slice(0, 18) + '…' : text);
            setGeneratedPlan(revised);
            setChatMessages(prev => [...prev, { role: 'ai', content: '計画を更新しました ✅' }]);
        } catch (err) {
            setChatMessages(prev => [...prev, { role: 'ai', content: `エラー: ${err.message}` }]);
        } finally {
            setIsChatLoading(false);
            setTimeout(() => chatEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 50);
        }
    };

    const toggleAi = () => {
        const next = !aiEnabled;
        setAiEnabled(next);
        localStorage.setItem('unitplan_ai_enabled', String(next));
    };

    useEffect(() => {
        if (apiKey) setShowSettings(false);
    }, [apiKey]);

    // 起動時に IndexedDB からフォルダハンドルを復元
    useEffect(() => {
        loadHandleIDB().then(handle => {
            if (handle) setFolderHandle(handle);
        });
    }, []);

    // 保存先フォルダを選択
    const handlePickFolder = async () => {
        if (!window.showDirectoryPicker) {
            alert('このブラウザはフォルダ指定保存に対応していません。Chrome または Edge をお使いください。');
            return;
        }
        try {
            const handle = await window.showDirectoryPicker({ mode: 'readwrite' });
            setFolderHandle(handle);
            setFolderName(handle.name);
            localStorage.setItem('unitplan_folder_name', handle.name);
            await saveHandleIDB(handle);
        } catch (e) {
            if (e.name !== 'AbortError') console.error(e);
        }
    };

    // 保存先フォルダを解除
    const handleClearFolder = async () => {
        setFolderHandle(null);
        setFolderName('');
        localStorage.removeItem('unitplan_folder_name');
        await clearHandleIDB();
    };

    // 研究構想図ファイルのアップロード処理
    const handleResearchFileUpload = async (e) => {
        const files = Array.from(e.target.files);
        for (const file of files) {
            if (file.type === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') {
                const arrayBuffer = await file.arrayBuffer();
                try {
                    const result = await mammoth.extractRawText({ arrayBuffer });
                    setResearchTextContent(prev =>
                        prev + `\n\n--- [研究資料: ${file.name}] ---\n` + result.value
                    );
                } catch {
                    alert(`${file.name} の読み込みに失敗しました。`);
                }
            } else if (file.type === 'application/pdf') {
                const reader = new FileReader();
                reader.onload = (ev) => {
                    const base64 = ev.target.result.split(',')[1];
                    setResearchFiles(prev => [...prev, { name: file.name, mimeType: 'application/pdf', data: base64 }]);
                };
                reader.readAsDataURL(file);
            } else {
                alert('対応していないファイル形式です (PDF, Word のみ)');
            }
        }
        if (researchFileInputRef.current) researchFileInputRef.current.value = '';
    };

    const removeResearchFile = (index) => {
        setResearchFiles(prev => prev.filter((_, i) => i !== index));
    };

    // API Key Handling
    const handleApiKeyChange = (e) => {
        // Auto-trim whitespace to prevent common copy-paste errors
        setApiKey(e.target.value.trim());
        setConnectionStatus('idle');
    };

    const testConnection = async () => {
        if (!apiKey) return;
        setConnectionStatus('testing');
        try {
            // 1. First, fetch available models for this key
            const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`);
            const data = await response.json();

            if (data.error) throw new Error(data.error.message);

            // 2. Filter for generating content models
            const validModels = data.models.filter(m =>
                m.name.includes('gemini') &&
                m.supportedGenerationMethods.includes('generateContent')
            );

            if (validModels.length === 0) throw new Error('使用可能なGeminiモデルが見つかりませんでした');

            // 3. Format for select dropdown
            const formattedModels = validModels.map(m => ({
                name: m.name.replace('models/', ''), // remove prefix for cleaner ID
                displayName: m.displayName || m.name
            })).sort((a, b) => {
                // Prioritize Flash 1.5
                if (a.name.includes('1.5-flash') && !b.name.includes('1.5-flash')) return -1;
                if (!a.name.includes('1.5-flash') && b.name.includes('1.5-flash')) return 1;
                return 0;
            });

            setAvailableModels(formattedModels);

            // 4. Update current model if needed
            const currentExists = formattedModels.find(m => m.name === model);
            if (!currentExists && formattedModels.length > 0) {
                setModel(formattedModels[0].name);
            }

            setConnectionStatus('success');
            setTimeout(() => setShowSettings(false), 1500); // Auto close
        } catch (err) {
            console.error(err);
            setConnectionStatus('error');
        }
    };

    // File Handling
    const handleFileUpload = async (e) => {
        const files = Array.from(e.target.files);

        for (const file of files) {
            if (file.type === "application/vnd.openxmlformats-officedocument.wordprocessingml.document") {
                // Handle .docx (convert to text)
                const arrayBuffer = await file.arrayBuffer();
                try {
                    const result = await mammoth.extractRawText({ arrayBuffer });
                    setGuideContent(prev => prev + `\n\n--- [File: ${file.name}] ---\n` + result.value);
                } catch (err) {
                    console.error("Docx parsing failed", err);
                    alert(`${file.name}の読み込みに失敗しました。`);
                }
            } else if (file.type === "application/pdf") {
                // Handle PDF (keep as base64 for Gemini)
                const reader = new FileReader();
                reader.onload = (e) => {
                    const base64Data = e.target.result.split(',')[1];
                    setAttachedFiles(prev => [...prev, {
                        name: file.name,
                        mimeType: 'application/pdf',
                        data: base64Data
                    }]);
                };
                reader.readAsDataURL(file);
            } else if (file.type.startsWith("text/") || file.name.endsWith(".md")) {
                // Handle Text files
                const text = await file.text();
                setGuideContent(prev => prev + `\n\n--- [File: ${file.name}] ---\n` + text);
            } else {
                alert("対応していないファイル形式です (PDF, Word, Textのみ)");
            }
        }
        // Reset input
        if (fileInputRef.current) fileInputRef.current.value = '';
    };

    const removeFile = (index) => {
        setAttachedFiles(prev => prev.filter((_, i) => i !== index));
    };

    const handleGenerate = async () => {
        if (!aiEnabled) {
            alert('AIがOFFになっています。ヘッダーのトグルボタンでONにしてください。');
            return;
        }
        if (!apiKey) {
            alert('APIキーが未設定です。Nova Lab Pro の「設定・連携」タブでGemini APIキーを登録してください。');
            return;
        }

        setIsLoading(true);
        setGeneratedPlan('');

        try {
            const systemPrompt = `
あなたは日本の公立学校における熟練した指導主事であり、授業改善のスペシャリストです。
以下の条件に基づき、「最高品質の単元指導計画」を作成してください。

## ★最重要：校内研究構想図・研究資料の反映
${researchFiles.length > 0 || researchTextContent
    ? `添付された研究構想図・研究資料を必ず精読し、以下を単元計画の全体に貫いてください。
- 研究テーマ・研究仮説・めざす子ども像
- 研究の具体的な手立て・手法・授業スタイル
- 研究が重視する評価の観点
${researchTextContent ? `\n【研究資料テキスト】\n${researchTextContent}` : ''}`
    : '（研究構想図は添付されていません。一般的な授業改善の視点で作成してください。）'
}

## 先生のパーソナライズ情報（最大限反映すること）
${TEACHER_QUESTIONS.map(q => {
    const val = teacherProfile[q.key]?.trim();
    return val ? `【${q.label}】\n${val}` : null;
}).filter(Boolean).join('\n\n') || '（入力なし）'}
※上記の先生の考え・こだわりを単元の目標・展開・評価・支援の全てに色濃く反映してください。

## 単元基本情報
- 校種: ${schoolType === 'elementary' ? '小学校' : '中学校'}
- 学年: ${grade}
- 教科: ${subject}
- 単元名: ${unitName}
- 学級タイプ: ${classType}
  ${classType === 'regular' ? '(通常学級 - UD視点での支援を記述)' : '(特別支援学級 - 特性に合わせた具体的かつ手厚い支援を記述)'}

## 学習指導要領・教材資料（追加テキスト）
${guideContent || '（テキスト入力なし）'}

## 出力フォーマット
Markdown形式で出力してください。
1. **単元設定の理由** (研究構想図との関連・先生のこだわり・児童の実態分析を含む)
2. **単元の目標** (知識・技能 / 思考・判断・表現 / 主体的に学習に取り組む態度)
3. **単元指導計画表** (Table形式)
   カラム: [時, 学習活動（児童・生徒の変容）, 指導上の留意点・支援（教師の手立て）, 評価（規準と方法）, UD・個別支援]

`;

            // Construct Payload
            const parts = [{ text: systemPrompt }];

            // 研究構想図PDFを最初に追加（高優先度）
            researchFiles.forEach(file => {
                parts.push({ inlineData: { mimeType: file.mimeType, data: file.data } });
            });

            // 学習指導要領・教材資料PDFを追加
            attachedFiles.forEach(file => {
                parts.push({ inlineData: { mimeType: file.mimeType, data: file.data } });
            });

            // Use selected model
            const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    contents: [{ parts: parts }]
                })
            });

            const data = await response.json();

            if (data.error) {
                throw new Error(data.error.message);
            }

            const text = data.candidates[0].content.parts[0].text;
            saveToHistory(text, '初回生成');
            setGeneratedPlan(text);
            setLayoutMode('refine');   // 生成完了 → 精錬モードへ
            setIsChatOpen(true);       // チャットを自動展開

        } catch (error) {
            console.error(error);
            alert('生成に失敗しました: ' + error.message);
        } finally {
            setIsLoading(false);
        }
    };


    const handleWordExport = async () => {
        if (!generatedPlan) return;
        const fileName = `${grade || ''}${subject || ''}_${unitName || '単元計画'}`;
        const result = await exportToWord(fileName, generatedPlan, {
            schoolType, grade, subject, unitName,
            researchTheme: researchTextContent.slice(0, 200) || '（研究構想図添付）',
            teacherFocus: Object.values(teacherProfile).filter(Boolean).join(' / ').slice(0, 200)
        }, folderHandle);
        if (result?.saved && result.folder) {
            alert(`「${result.folder}」に保存しました ✅`);
        }
    };

    const handleTextExport = async () => {
        if (!generatedPlan) return;
        const baseName = `${grade || ''}${subject || ''}_${unitName || '単元計画'}`;
        const blob = new Blob([generatedPlan], { type: 'text/plain;charset=utf-8' });

        if (folderHandle) {
            try {
                const perm = await folderHandle.requestPermission({ mode: 'readwrite' });
                if (perm === 'granted') {
                    const fh = await folderHandle.getFileHandle(`${baseName}.txt`, { create: true });
                    const writable = await fh.createWritable();
                    await writable.write(blob);
                    await writable.close();
                    alert(`「${folderHandle.name}」に保存しました ✅`);
                    return;
                }
            } catch (err) { console.error(err); }
        }
        saveAs(blob, `${baseName}.txt`);
    };

    const handleHandover = () => {
        if (!generatedPlan) {
            alert("まずは単元計画を作成してください！");
            return;
        }

        // Save context for the next app
        const projectData = {
            id: Date.now(),
            timestamp: new Date().toISOString(),
            context: {
                schoolType, grade, subject, unitName, classType,
                teacherFocus: Object.values(teacherProfile).filter(Boolean).join(' / ').slice(0, 200),
                hasResearchFiles: researchFiles.length > 0 || !!researchTextContent
            },
            content: {
                guideContent,
                unitPlanMarkdown: generatedPlan
            },
            status: 'ready_for_lesson_plan'
        };

        try {
            // Save to LocalStorage to simulate "Cloud/Database" for the suite
            localStorage.setItem('tlab_current_project', JSON.stringify(projectData));

            alert(`🎉 連携データを保存しました！\n\n「${unitName}」の理念と計画を引き継いで、\n次の「授業案作成アプリ」で即座に作業を開始できます。`);

        } catch (err) {
            console.error(err);
            alert("データの保存に失敗しました");
        }
    };

    const handleGoogleDocCopy = async () => {
        if (!previewRef.current) return;

        try {
            // Get the HTML content
            const htmlContent = previewRef.current.innerHTML;
            const textContent = previewRef.current.innerText;

            // Create blobs for clipboard
            const blobHtml = new Blob([htmlContent], { type: "text/html" });
            const blobText = new Blob([textContent], { type: "text/plain" });

            const data = [new ClipboardItem({
                ["text/html"]: blobHtml,
                ["text/plain"]: blobText,
            })];

            await navigator.clipboard.write(data);
            alert("Googleドキュメント用にコピーしました！\n\nGoogleドキュメントを開いて「貼り付け」してください。表や見出しがそのまま反映されます。");
        } catch (err) {
            console.error("Copy failed", err);
            // Fallback
            navigator.clipboard.writeText(generatedPlan);
            alert("コピーしました（テキスト形式）");
        }
    };

    return (
        <div className="min-h-screen bg-slate-50 text-slate-800 font-sans">
            {/* Header */}
            <header className="bg-white border-b border-slate-200 sticky top-0 z-10 shadow-sm">
                <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <div className="p-2 bg-indigo-600 rounded-lg shadow-lg shadow-indigo-200">
                            <BookOpen className="w-6 h-6 text-white" />
                        </div>
                        <h1 className="text-xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-indigo-700 to-indigo-500">
                            Unit Plan Pro <span className="text-sm font-medium text-slate-400 ml-2">for Teachers</span>
                        </h1>
                    </div>
                    <div className="flex items-center gap-3">
                        {/* AI ON/OFF トグル */}
                        <button
                            onClick={toggleAi}
                            className={cn(
                                "flex items-center gap-2 px-4 py-2 rounded-full text-sm font-bold transition-all border-2",
                                aiEnabled && apiKey
                                    ? "bg-emerald-50 text-emerald-700 border-emerald-300 hover:bg-emerald-100"
                                    : aiEnabled && !apiKey
                                    ? "bg-amber-50 text-amber-700 border-amber-300 hover:bg-amber-100"
                                    : "bg-slate-100 text-slate-500 border-slate-200 hover:bg-slate-200"
                            )}
                            title={!apiKey ? "Nova Lab ProでAPIキーを設定してください" : aiEnabled ? "クリックでAIをOFF" : "クリックでAIをON"}
                        >
                            <div className={cn(
                                "w-2 h-2 rounded-full",
                                aiEnabled && apiKey ? "bg-emerald-500 animate-pulse" :
                                aiEnabled && !apiKey ? "bg-amber-500 animate-pulse" :
                                "bg-slate-400"
                            )} />
                            {aiEnabled
                                ? apiKey ? "AI 稼働中" : "AI ON（キー未着）"
                                : "AI OFF"}
                        </button>
                        <button
                            onClick={() => setShowSettings(!showSettings)}
                            className="p-2 hover:bg-slate-100 rounded-full transition-colors"
                        >
                            <Settings className="w-5 h-5 text-slate-600" />
                        </button>
                    </div>
                </div>
            </header>

            {/* ステップインジケーター */}
            <div className="border-b border-slate-100 bg-white/80 backdrop-blur-sm">
                <div className="max-w-7xl mx-auto px-6 py-2 flex items-center gap-1 overflow-x-auto">
                    {[
                        { step: 1, label: '基本設定', mode: 'design' },
                        { step: 2, label: '研究構想図', mode: 'design' },
                        { step: 3, label: 'こだわり入力', mode: 'design' },
                        { step: 4, label: '教材・指導要領', mode: 'design' },
                        { step: 5, label: '生成', mode: 'design' },
                        { step: 6, label: 'AI精錬', mode: 'refine' },
                    ].map((s, i, arr) => {
                        const isRefineStep = s.mode === 'refine';
                        const isActive = layoutMode === 'refine' ? isRefineStep : (s.step <= 5);
                        const isCurrent = layoutMode === 'refine' ? isRefineStep : s.step === 5;
                        return (
                            <React.Fragment key={s.step}>
                                <button
                                    onClick={() => { if (s.mode === 'design') setLayoutMode('design'); else if (generatedPlan) setLayoutMode('refine'); }}
                                    className={cn(
                                        "flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold whitespace-nowrap transition-all",
                                        isCurrent
                                            ? "bg-indigo-600 text-white shadow-sm"
                                            : isActive && !isRefineStep
                                            ? "bg-indigo-50 text-indigo-600"
                                            : isRefineStep && generatedPlan
                                            ? "bg-emerald-50 text-emerald-600 hover:bg-emerald-100"
                                            : "text-slate-400 cursor-default"
                                    )}
                                >
                                    <span className={cn(
                                        "w-4 h-4 rounded-full flex items-center justify-center text-[10px] font-black shrink-0",
                                        isCurrent ? "bg-white text-indigo-600" : "bg-current/20"
                                    )}>{s.step}</span>
                                    {s.label}
                                </button>
                                {i < arr.length - 1 && <ChevronRight className="w-3 h-3 text-slate-300 shrink-0" />}
                            </React.Fragment>
                        );
                    })}
                    {generatedPlan && (
                        <button
                            onClick={() => { setLayoutMode('design'); }}
                            className="ml-auto text-xs text-slate-400 hover:text-slate-600 flex items-center gap-1 whitespace-nowrap px-2"
                        >
                            ← 設計に戻る
                        </button>
                    )}
                </div>
            </div>

            <main className="max-w-7xl mx-auto px-6 py-8 grid grid-cols-1 lg:grid-cols-12 gap-8">

                {/* Left Column: Inputs（精錬モード時は非表示） */}
                <div className={cn(
                    "space-y-6 transition-all duration-500",
                    layoutMode === 'refine' ? "hidden" : "lg:col-span-5"
                )}>

                    {/* Settings Card */}
                    <AnimatePresence>
                        {showSettings && (
                            <motion.div
                                initial={{ opacity: 0, height: 0 }}
                                animate={{ opacity: 1, height: 'auto' }}
                                exit={{ opacity: 0, height: 0 }}
                                className="bg-white rounded-xl shadow-premium border border-indigo-100 overflow-hidden"
                            >
                                <div className="p-5 space-y-4">
                                    <h3 className="font-bold text-indigo-900 flex items-center gap-2">
                                        <Settings className="w-4 h-4" /> システム設定
                                    </h3>

                                    <div className="space-y-4">
                                        <div>
                                            <label className="block text-xs font-semibold uppercase text-slate-500 mb-1">使用モデル</label>
                                            <select
                                                value={model}
                                                onChange={(e) => setModel(e.target.value)}
                                                className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:outline-none text-sm"
                                            >
                                                {availableModels.map((m) => (
                                                    <option key={m.name} value={m.name}>
                                                        {m.displayName}
                                                    </option>
                                                ))}
                                            </select>
                                            {connectionStatus === 'success' && (
                                                <p className="text-[10px] text-emerald-600 mt-1 text-right">
                                                    ✨ お使いのキーで利用可能なモデルを自動取得しました
                                                </p>
                                            )}
                                        </div>

                                        {/* APIキーはNova Lab Proから自動連携 */}
                                        <div className={cn(
                                            "flex items-center gap-3 p-3 rounded-lg border",
                                            apiKey
                                                ? "bg-emerald-50 border-emerald-200 text-emerald-800"
                                                : "bg-amber-50 border-amber-200 text-amber-800"
                                        )}>
                                            <div className={cn(
                                                "w-2.5 h-2.5 rounded-full shrink-0",
                                                apiKey ? "bg-emerald-500" : "bg-amber-400 animate-pulse"
                                            )} />
                                            <div className="text-xs font-semibold leading-snug">
                                                {apiKey
                                                    ? <>Gemini APIキー連携済み<br /><span className="font-normal opacity-70">Nova Lab Pro から自動取得</span></>
                                                    : <>APIキー未取得<br /><span className="font-normal">Nova Lab Pro の「設定・連携」でキーを登録してください</span></>
                                                }
                                            </div>
                                        </div>
                                    </div>
                                    {connectionStatus === 'error' && (
                                        <p className="text-xs text-red-500 bg-red-50 p-2 rounded">
                                            接続に失敗しました。キーが正しいか、またはモデルが利用可能か確認してください。<br />
                                            ※古いモデル(1.0 pro等)は廃止された可能性があります。
                                        </p>
                                    )}
                                </div>
                            </motion.div>
                        )}
                    </AnimatePresence>

                    {/* Research & Vision */}
                    <div className="grid grid-cols-1 gap-4">
                        {/* 研究構想図アップロード */}
                        <div className="bg-gradient-to-br from-violet-600 to-indigo-700 rounded-xl shadow-float text-white p-6 relative overflow-hidden group">
                            <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
                                <School className="w-24 h-24" />
                            </div>
                            <h2 className="text-lg font-bold mb-1 flex items-center gap-2 relative z-10">
                                <School className="w-5 h-5" /> 研究構想図・研究資料
                            </h2>
                            <p className="text-xs text-indigo-200 mb-3 relative z-10">
                                PDF または Word でアップロード。AIが研究の方向性を最優先で単元計画に反映します。
                            </p>

                            {/* アップロードボタン */}
                            <input
                                type="file"
                                ref={researchFileInputRef}
                                className="hidden"
                                multiple
                                accept=".pdf,.docx"
                                onChange={handleResearchFileUpload}
                            />
                            <button
                                onClick={() => researchFileInputRef.current?.click()}
                                className="relative z-10 flex items-center gap-2 px-4 py-2 bg-white/15 hover:bg-white/25 border border-white/30 rounded-lg text-sm font-bold transition-all"
                            >
                                <Upload className="w-4 h-4" /> ファイルを追加（PDF / Word）
                            </button>

                            {/* 追加済みファイル一覧 */}
                            {(researchFiles.length > 0 || researchTextContent) && (
                                <div className="relative z-10 mt-3 space-y-1">
                                    {researchFiles.map((f, i) => (
                                        <div key={i} className="flex items-center justify-between bg-white/15 rounded-lg px-3 py-1.5 text-xs">
                                            <div className="flex items-center gap-2 overflow-hidden">
                                                <FileIcon className="w-3 h-3 shrink-0" />
                                                <span className="truncate">{f.name}</span>
                                                <span className="opacity-60 shrink-0">PDF</span>
                                            </div>
                                            <button onClick={() => removeResearchFile(i)} className="opacity-60 hover:opacity-100 ml-2">
                                                <X className="w-3 h-3" />
                                            </button>
                                        </div>
                                    ))}
                                    {researchTextContent && (
                                        <div className="flex items-center justify-between bg-white/15 rounded-lg px-3 py-1.5 text-xs">
                                            <div className="flex items-center gap-2">
                                                <FileIcon className="w-3 h-3 shrink-0" />
                                                <span>Wordファイル（テキスト抽出済み）</span>
                                            </div>
                                            <button onClick={() => setResearchTextContent('')} className="opacity-60 hover:opacity-100 ml-2">
                                                <X className="w-3 h-3" />
                                            </button>
                                        </div>
                                    )}
                                </div>
                            )}

                            {researchFiles.length === 0 && !researchTextContent && (
                                <p className="relative z-10 mt-3 text-xs text-indigo-300 italic">
                                    ※ 未添付の場合は汎用的な単元計画を作成します
                                </p>
                            )}
                        </div>

                        {/* 先生のこだわり・パーソナライズ */}
                        <button
                            onClick={() => setShowTeacherModal(true)}
                            className="bg-gradient-to-br from-pink-500 to-rose-600 rounded-xl shadow-float text-white p-6 relative overflow-hidden group text-left w-full transition-all hover:shadow-xl hover:scale-[1.01]"
                        >
                            <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
                                <Heart className="w-24 h-24" />
                            </div>
                            <h2 className="text-lg font-bold mb-1 flex items-center gap-2 relative z-10">
                                <Heart className="w-5 h-5" /> 先生のこだわり・パーソナライズ
                            </h2>
                            <p className="text-sm text-pink-100 relative z-10 mb-3">
                                授業観・めざす子ども像・クラスの実態などを入力してAIに伝えます
                            </p>
                            <div className="relative z-10 flex items-center justify-between">
                                <div className="flex items-center gap-2">
                                    {filledCount > 0 ? (
                                        <>
                                            <CheckCircle2 className="w-4 h-4 text-pink-200" />
                                            <span className="text-sm font-bold text-pink-100">
                                                {filledCount} / {TEACHER_QUESTIONS.length} 項目 入力済み
                                            </span>
                                        </>
                                    ) : (
                                        <span className="text-sm text-pink-200">未入力（クリックして入力）</span>
                                    )}
                                </div>
                                <div className="flex items-center gap-1 text-sm font-bold bg-white/20 px-3 py-1.5 rounded-lg">
                                    <User className="w-4 h-4" /> 入力・編集する <ChevronRight className="w-4 h-4" />
                                </div>
                            </div>
                        </button>
                    </div>

                    {/* Unit Context */}
                    <div className="bg-white rounded-xl shadow-premium p-6 space-y-4 border border-slate-100">
                        <h3 className="font-bold text-slate-700 flex items-center gap-2 mb-2">
                            <GraduationCap className="w-5 h-5 text-indigo-500" /> 単元基本情報
                        </h3>

                        <div className="grid grid-cols-2 gap-4">
                            <div>
                                <label className="block text-xs font-semibold text-slate-500 mb-1">校種</label>
                                <select
                                    value={schoolType}
                                    onChange={(e) => setSchoolType(e.target.value)}
                                    className="w-full p-2 bg-slate-50 border border-slate-200 rounded-lg text-sm"
                                >
                                    <option value="elementary">小学校</option>
                                    <option value="junior_high">中学校</option>
                                </select>
                            </div>
                            <div>
                                <label className="block text-xs font-semibold text-slate-500 mb-1">学年</label>
                                <input
                                    type="text"
                                    value={grade}
                                    onChange={(e) => setGrade(e.target.value)}
                                    placeholder="例: 第5学年"
                                    className="w-full p-2 bg-slate-50 border border-slate-200 rounded-lg text-sm"
                                />
                            </div>
                        </div>

                        <div>
                            <label className="block text-xs font-semibold text-slate-500 mb-1">教科・領域</label>
                            <input
                                type="text"
                                value={subject}
                                onChange={(e) => setSubject(e.target.value)}
                                placeholder="例: 国語、道徳、総合..."
                                className="w-full p-2 bg-slate-50 border border-slate-200 rounded-lg text-sm"
                            />
                        </div>

                        <div>
                            <label className="block text-xs font-semibold text-slate-500 mb-1">学級タイプ (特別支援対応)</label>
                            <select
                                value={classType}
                                onChange={(e) => setClassType(e.target.value)}
                                className="w-full p-2 bg-slate-50 border border-slate-200 rounded-lg text-sm"
                            >
                                <option value="regular">通常学級 (要支援児への配慮含む)</option>
                                <option value="special_intellectual">特別支援 (知的障害)</option>
                                <option value="special_emotional">特別支援 (自閉症・情緒障害)</option>
                                <option value="special_physical">特別支援 (肢体不自由)</option>
                                <option value="resource_room">通級指導教室</option>
                            </select>
                        </div>

                        <div>
                            <label className="block text-xs font-semibold text-slate-500 mb-1">単元名</label>
                            <input
                                type="text"
                                value={unitName}
                                onChange={(e) => setUnitName(e.target.value)}
                                placeholder="例: 世界に一つだけの花（大造じいさんとガン）"
                                className="w-full p-2 bg-slate-50 border border-slate-200 rounded-lg text-sm"
                            />
                        </div>
                    </div>

                    {/* Resources Upload */}
                    <div className="bg-white rounded-xl shadow-premium p-6 space-y-4 border border-slate-100">
                        <h3 className="font-bold text-slate-700 flex items-center gap-2 mb-2">
                            <FileText className="w-5 h-5 text-emerald-500" /> 学習指導要領・教材資料
                        </h3>

                        {/* File Drop Area */}
                        <div
                            onClick={() => fileInputRef.current?.click()}
                            className="border-2 border-dashed border-emerald-200 rounded-xl p-6 text-center hover:bg-emerald-50 transition-colors cursor-pointer group"
                        >
                            <input
                                type="file"
                                ref={fileInputRef}
                                className="hidden"
                                multiple
                                accept=".pdf,.docx,.txt,.md"
                                onChange={handleFileUpload}
                            />
                            <div className="flex flex-col items-center gap-2 text-slate-400 group-hover:text-emerald-600 transition-colors">
                                <Upload className="w-8 h-8" />
                                <span className="text-sm font-medium">
                                    クリックしてファイルをアップロード<br />
                                    <span className="text-xs opacity-75">(PDF, Word, Textに対応)</span>
                                </span>
                            </div>
                        </div>

                        {/* Attached Files List */}
                        {attachedFiles.length > 0 && (
                            <div className="space-y-2">
                                <p className="text-xs font-bold text-slate-500">読み込み済みファイル (PDF):</p>
                                {attachedFiles.map((f, i) => (
                                    <div key={i} className="flex items-center justify-between p-2 bg-slate-100 rounded text-xs">
                                        <div className="flex items-center gap-2 overflow-hidden">
                                            <FileIcon className="w-3 h-3 shrink-0" />
                                            <span className="truncate">{f.name}</span>
                                        </div>
                                        <button onClick={() => removeFile(i)} className="text-slate-400 hover:text-red-500">
                                            <X className="w-3 h-3" />
                                        </button>
                                    </div>
                                ))}
                            </div>
                        )}

                        <textarea
                            value={guideContent}
                            onChange={(e) => setGuideContent(e.target.value)}
                            placeholder="ファイルの内容に加えて、補足テキストがあればここに記述..."
                            className="w-full p-3 bg-slate-50 border border-slate-200 rounded-lg text-sm h-32 focus:ring-2 focus:ring-emerald-500 focus:outline-none transition-all"
                        />

                        <div className="p-3 bg-emerald-50 text-emerald-700 text-xs rounded-lg flex items-start gap-2">
                            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                            <span>
                                学習指導要領や教科書のPDF、Wordファイルをアップしてください。AIが内容を読み取り、単元計画に反映します。
                            </span>
                        </div>
                    </div>

                    <button
                        onClick={handleGenerate}
                        disabled={isLoading || !aiEnabled}
                        className={cn(
                            "w-full py-4 rounded-xl font-bold text-lg shadow-float transition-all transform active:scale-95 flex items-center justify-center gap-2",
                            isLoading
                                ? "bg-slate-300 text-slate-500 cursor-not-allowed"
                                : !aiEnabled
                                ? "bg-slate-200 text-slate-400 cursor-not-allowed"
                                : "bg-gradient-to-r from-indigo-600 to-violet-600 text-white hover:from-indigo-500 hover:to-violet-500"
                        )}
                    >
                        {isLoading ? (
                            <>
                                <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                                生成中...
                            </>
                        ) : !aiEnabled ? (
                            <>
                                <Settings className="w-5 h-5" /> AI OFF — ヘッダーのトグルでONにしてください
                            </>
                        ) : (
                            <>
                                <Sparkles className="w-5 h-5" /> 単元指導計画を作成
                            </>
                        )}
                    </button>

                </div>

                {/* Right Column: Output（精錬モード時は全幅） */}
                <div className={cn(
                    "flex flex-col gap-4 sticky top-24 min-h-0 transition-all duration-500",
                    layoutMode === 'refine' ? "lg:col-span-12 h-[calc(100vh-9rem)]" : "lg:col-span-7 h-[calc(100vh-8rem)]"
                )}>

                    {/* Action Bar (Final: Optimized for Organization) */}
                    <div className="bg-white rounded-xl shadow-sm border border-indigo-100 p-5 flex flex-col gap-4 shrink-0">
                        {/* Header */}
                        <div className="flex items-center gap-3 border-b border-indigo-50 pb-3">
                            <div className="p-2 bg-indigo-50 rounded-lg text-indigo-600 shrink-0">
                                <Sparkles className="w-5 h-5" />
                            </div>
                            <div>
                                <h3 className="font-bold text-slate-700 text-sm">Next Action</h3>
                                <p className="text-xs text-slate-500 mt-0.5">計画を保存して、次のステップへ</p>
                            </div>
                        </div>

                        {/* 保存先フォルダ */}
                        <div className={cn(
                            "flex items-center gap-2 px-3 py-2 rounded-lg border text-xs",
                            folderHandle
                                ? "bg-emerald-50 border-emerald-200 text-emerald-800"
                                : "bg-slate-50 border-slate-200 text-slate-500"
                        )}>
                            <FolderOpen className="w-4 h-4 shrink-0" />
                            <span className="flex-1 truncate font-medium">
                                {folderHandle
                                    ? <><span className="opacity-60 font-normal">保存先：</span>{folderName}</>
                                    : <span className="opacity-70">保存先フォルダ未設定（毎回ダイアログ）</span>
                                }
                            </span>
                            <button
                                onClick={handlePickFolder}
                                className={cn(
                                    "shrink-0 px-2 py-1 rounded font-bold transition-colors",
                                    folderHandle
                                        ? "bg-emerald-100 hover:bg-emerald-200 text-emerald-700"
                                        : "bg-indigo-100 hover:bg-indigo-200 text-indigo-700"
                                )}
                            >
                                {folderHandle ? '変更' : 'フォルダを選択'}
                            </button>
                            {folderHandle && (
                                <button onClick={handleClearFolder} title="解除" className="shrink-0 text-slate-400 hover:text-red-500 transition-colors">
                                    <FolderX className="w-4 h-4" />
                                </button>
                            )}
                        </div>
                        {folderName && !folderHandle && (
                            <p className="text-[10px] text-amber-600 -mt-2">
                                前回の保存先「{folderName}」— <button onClick={handlePickFolder} className="underline hover:text-amber-800">再度許可する</button>
                            </p>
                        )}

                        {/* Actions */}
                        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-4">

                            {/* Save File (The T-Lab Way: Organized) */}
                            <div className="flex flex-col gap-2 w-full sm:w-auto">
                                <div className="flex gap-2">
                                    <button
                                        onClick={handleWordExport}
                                        disabled={!generatedPlan}
                                        className="group relative px-4 py-2 bg-white border-2 border-slate-200 text-slate-700 rounded-lg text-sm font-bold hover:border-indigo-500 hover:text-indigo-600 transition-all flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap"
                                        title="Microsoft WordやGoogleドキュメントで編集できます"
                                    >
                                        <FileText className="w-4 h-4" />
                                        <div className="text-left leading-tight">
                                            <span className="block">保存 (.docx)</span>
                                            <span className="text-[9px] text-slate-400 font-normal">Word / Google互換</span>
                                        </div>
                                    </button>

                                    <button
                                        onClick={handleTextExport}
                                        disabled={!generatedPlan}
                                        className="px-3 py-2 bg-slate-50 border border-slate-200 text-slate-600 rounded-lg text-xs font-bold hover:bg-slate-100 transition-all flex items-center justify-center gap-1 disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap"
                                        title="メモ帳などで開ける形式で保存します"
                                    >
                                        <FileIcon className="w-3 h-3" />
                                        <span>.txt</span>
                                    </button>
                                </div>

                                {/* Copy Fallback */}
                                <button
                                    onClick={handleGoogleDocCopy}
                                    className="text-[10px] text-slate-400 hover:text-indigo-500 flex items-center gap-1 justify-center sm:justify-start px-1"
                                >
                                    <FileIcon className="w-3 h-3" />
                                    <span>クリップボードにコピー (貼り付け用)</span>
                                </button>
                            </div>

                            {/* Next Step */}
                            <button
                                onClick={handleHandover}
                                disabled={!generatedPlan}
                                className="px-6 py-3 bg-gradient-to-r from-emerald-500 to-teal-600 text-white rounded-lg text-sm font-bold shadow-md shadow-emerald-100 hover:shadow-lg hover:from-emerald-400 hover:to-teal-500 transition-all flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed transform active:scale-[0.98] whitespace-nowrap sm:ml-auto"
                            >
                                <Sparkles className="w-5 h-5" />
                                <span>授業案作成へ進む</span>
                            </button>
                        </div>
                    </div>

                    {/* Preview Area */}
                    <div className="bg-white rounded-xl shadow-premium border border-slate-100 flex-grow min-h-0 flex flex-col overflow-hidden">
                        <div className="p-4 border-b border-slate-100 flex items-center justify-between bg-slate-50/50 shrink-0">
                            <h3 className="font-bold text-slate-700">生成プレビュー</h3>
                            {generatedPlan && (
                                <div className="flex items-center gap-2">
                                    <span className="text-xs text-slate-400">修正回数: {chatMessages.filter(m => m.role === 'user').length}</span>
                                    {planHistory.length > 0 && (
                                        <button
                                            onClick={() => setShowHistoryModal(true)}
                                            className="text-xs flex items-center gap-1 text-slate-400 hover:text-violet-600 font-medium px-2 py-1 rounded transition-colors"
                                        >
                                            <History className="w-3 h-3" /> 履歴 ({planHistory.length})
                                        </button>
                                    )}
                                    <button
                                        onClick={() => navigator.clipboard.writeText(generatedPlan)}
                                        className="text-xs flex items-center gap-1 text-slate-400 hover:text-indigo-600 font-medium px-2 py-1 rounded transition-colors"
                                    >
                                        <Save className="w-3 h-3" /> Markdownコピー
                                    </button>
                                </div>
                            )}
                        </div>
                        <div className="p-8 flex-grow overflow-y-auto min-h-0">
                            {generatedPlan ? (
                                <div ref={previewRef} className="prose prose-slate max-w-none prose-headings:font-bold prose-h1:text-2xl prose-h2:text-xl prose-h3:text-lg prose-p:text-sm prose-li:text-sm prose-table:text-sm prose-th:bg-slate-100 prose-td:border-slate-200">
                                    <ReactMarkdown remarkPlugins={[remarkGfm]}>
                                        {generatedPlan}
                                    </ReactMarkdown>
                                </div>
                            ) : (
                                <div className="h-full flex flex-col items-center justify-center text-slate-300 space-y-4">
                                    <FileIcon className="w-16 h-16 opacity-20" />
                                    <p className="text-center font-medium">
                                        左側のフォームに入力して<br />
                                        「単元指導計画」を作成してください
                                    </p>
                                </div>
                            )}
                        </div>
                    </div>

                    {/* ===== AI修正チャットパネル ===== */}
                    <div className={cn(
                        "bg-white rounded-xl border shadow-lg flex flex-col overflow-hidden transition-all duration-300 shrink-0",
                        isChatOpen ? "border-indigo-200 max-h-[42vh]" : "border-slate-200 max-h-[52px]"
                    )}>
                        {/* チャットパネルヘッダー（常に表示） */}
                        <button
                            onClick={() => setIsChatOpen(o => !o)}
                            disabled={!generatedPlan}
                            className={cn(
                                "flex items-center justify-between px-4 py-3 w-full text-left transition-colors shrink-0",
                                generatedPlan
                                    ? isChatOpen ? "bg-indigo-600 text-white" : "bg-indigo-50 hover:bg-indigo-100 text-indigo-700"
                                    : "bg-slate-50 text-slate-400 cursor-not-allowed"
                            )}
                        >
                            <div className="flex items-center gap-2 font-bold text-sm">
                                <MessageCircle className="w-4 h-4" />
                                AI修正チャット
                                {chatMessages.filter(m => m.role === 'user').length > 0 && (
                                    <span className={cn(
                                        "text-xs px-2 py-0.5 rounded-full font-bold",
                                        isChatOpen ? "bg-white/20 text-white" : "bg-indigo-100 text-indigo-600"
                                    )}>
                                        {chatMessages.filter(m => m.role === 'user').length}回修正済み
                                    </span>
                                )}
                                {!generatedPlan && <span className="text-xs font-normal opacity-60">（計画を生成後に使用できます）</span>}
                            </div>
                            {isChatOpen ? <ChevronDown className="w-4 h-4" /> : <ChevronUp className="w-4 h-4" />}
                        </button>

                        {/* チャット本体（展開時） */}
                        {isChatOpen && (
                            <div className="flex flex-col flex-1 min-h-0">
                                {/* クイックチップ */}
                                <div className="px-3 pt-3 pb-2 border-b border-slate-100 shrink-0">
                                    <p className="text-[10px] font-bold text-slate-400 uppercase mb-2 flex items-center gap-1">
                                        <Zap className="w-3 h-3" /> ワンタップ修正
                                    </p>
                                    <div className="flex gap-1.5 flex-wrap">
                                        {QUICK_CHIPS.map((chip) => (
                                            <button
                                                key={chip.label}
                                                onClick={() => handleChatSend(chip.instruction)}
                                                disabled={isChatLoading}
                                                className="text-xs px-2.5 py-1.5 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 rounded-lg font-medium transition-colors border border-indigo-100 disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap"
                                            >
                                                {chip.label}
                                            </button>
                                        ))}
                                    </div>
                                </div>

                                {/* メッセージ履歴 */}
                                <div className="flex-1 overflow-y-auto min-h-0 px-4 py-3 space-y-2">
                                    {chatMessages.length === 0 ? (
                                        <p className="text-xs text-slate-400 text-center py-4">
                                            上のチップを押すか、下のテキストボックスに自由に指示を入力してください
                                        </p>
                                    ) : (
                                        chatMessages.map((msg, i) => (
                                            <div key={i} className={cn(
                                                "flex",
                                                msg.role === 'user' ? "justify-end" : "justify-start"
                                            )}>
                                                <div className={cn(
                                                    "max-w-[85%] px-3 py-2 rounded-xl text-sm",
                                                    msg.role === 'user'
                                                        ? "bg-indigo-600 text-white rounded-br-sm"
                                                        : "bg-slate-100 text-slate-700 rounded-bl-sm"
                                                )}>
                                                    {msg.content}
                                                </div>
                                            </div>
                                        ))
                                    )}
                                    {isChatLoading && (
                                        <div className="flex justify-start">
                                            <div className="bg-slate-100 px-4 py-2 rounded-xl rounded-bl-sm flex items-center gap-2 text-sm text-slate-500">
                                                <div className="w-3 h-3 border-2 border-slate-300 border-t-indigo-500 rounded-full animate-spin" />
                                                AIが修正中...
                                            </div>
                                        </div>
                                    )}
                                    <div ref={chatEndRef} />
                                </div>

                                {/* 入力エリア */}
                                <div className="p-3 border-t border-slate-100 shrink-0 flex gap-2 bg-slate-50">
                                    <input
                                        type="text"
                                        value={chatInput}
                                        onChange={e => setChatInput(e.target.value)}
                                        onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleChatSend(); } }}
                                        placeholder="例：3時目をグループ活動中心に書き直して..."
                                        disabled={isChatLoading}
                                        className="flex-1 px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-400 bg-white disabled:opacity-50"
                                    />
                                    <button
                                        onClick={() => handleChatSend()}
                                        disabled={!chatInput.trim() || isChatLoading}
                                        className="px-3 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-1"
                                    >
                                        <Send className="w-4 h-4" />
                                    </button>
                                    {chatMessages.length > 0 && (
                                        <button
                                            onClick={() => setChatMessages([])}
                                            title="履歴をクリア"
                                            className="px-2 py-2 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-200 transition-colors"
                                        >
                                            <RotateCcw className="w-4 h-4" />
                                        </button>
                                    )}
                                </div>
                            </div>
                        )}
                    </div>
                </div>

            </main>

            {/* ===== 変更履歴・差分表示モーダル ===== */}
            <AnimatePresence>
                {showHistoryModal && (
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/70 backdrop-blur-sm p-4"
                        onClick={(e) => { if (e.target === e.currentTarget) { setShowHistoryModal(false); setDiffTarget(null); } }}
                    >
                        <motion.div
                            initial={{ scale: 0.95, y: 30, opacity: 0 }}
                            animate={{ scale: 1, y: 0, opacity: 1 }}
                            exit={{ scale: 0.95, y: 30, opacity: 0 }}
                            transition={{ type: 'spring', stiffness: 300, damping: 30 }}
                            className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl max-h-[90vh] flex flex-col overflow-hidden"
                        >
                            {/* ヘッダー */}
                            <div className="bg-gradient-to-r from-violet-600 to-indigo-600 px-6 py-4 flex items-center justify-between shrink-0">
                                <div>
                                    <h2 className="text-lg font-bold text-white flex items-center gap-2">
                                        <History className="w-5 h-5" /> 変更履歴・差分表示
                                    </h2>
                                    <p className="text-violet-200 text-xs mt-0.5">{planHistory.length} バージョン保存済み</p>
                                </div>
                                <button onClick={() => { setShowHistoryModal(false); setDiffTarget(null); }} className="p-2 hover:bg-white/20 rounded-full transition-colors">
                                    <X className="w-5 h-5 text-white" />
                                </button>
                            </div>

                            <div className="flex flex-1 min-h-0 overflow-hidden">
                                {/* バージョン一覧（左） */}
                                <div className="w-56 border-r border-slate-100 overflow-y-auto shrink-0 bg-slate-50">
                                    {planHistory.map((h, i) => {
                                        const isSelected = diffTarget === i;
                                        const nextPlan = i < planHistory.length - 1 ? planHistory[i + 1].plan : generatedPlan;
                                        const diff = lineDiff(h.plan, nextPlan);
                                        const { added, removed } = countChanges(diff);
                                        return (
                                            <button
                                                key={h.id}
                                                onClick={() => setDiffTarget(isSelected ? null : i)}
                                                className={cn(
                                                    "w-full text-left px-4 py-3 border-b border-slate-100 transition-colors",
                                                    isSelected ? "bg-violet-50 border-l-4 border-l-violet-500" : "hover:bg-white"
                                                )}
                                            >
                                                <div className="flex items-center justify-between mb-1">
                                                    <span className="text-xs font-bold text-slate-600">v{i + 1}</span>
                                                    <span className="text-[10px] text-slate-400">
                                                        {h.ts.toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' })}
                                                    </span>
                                                </div>
                                                <div className="text-xs text-slate-700 truncate mb-1">{h.label}</div>
                                                {(added > 0 || removed > 0) && (
                                                    <div className="flex gap-2 text-[10px] font-mono">
                                                        {added > 0 && <span className="text-emerald-600">+{added}</span>}
                                                        {removed > 0 && <span className="text-red-500">-{removed}</span>}
                                                    </div>
                                                )}
                                            </button>
                                        );
                                    })}
                                    <div className="w-full text-left px-4 py-3 bg-indigo-50 border-l-4 border-l-indigo-500">
                                        <div className="flex items-center justify-between mb-1">
                                            <span className="text-xs font-bold text-indigo-600">現在</span>
                                            <span className="text-[10px] text-indigo-400">最新</span>
                                        </div>
                                        <div className="text-xs text-indigo-700">現在の計画</div>
                                    </div>
                                </div>

                                {/* 差分ビュー（右） */}
                                <div className="flex-1 overflow-y-auto p-5">
                                    {diffTarget !== null ? (() => {
                                        const h = planHistory[diffTarget];
                                        const nextPlan = diffTarget < planHistory.length - 1 ? planHistory[diffTarget + 1].plan : generatedPlan;
                                        const diff = lineDiff(h.plan, nextPlan);
                                        const { added, removed } = countChanges(diff);
                                        return (
                                            <div className="space-y-4">
                                                <div className="flex items-center justify-between">
                                                    <div>
                                                        <span className="font-bold text-slate-700">
                                                            v{diffTarget + 1} → {diffTarget < planHistory.length - 1 ? `v${diffTarget + 2}` : '現在'}
                                                        </span>
                                                        <span className="ml-3 text-xs text-slate-500">「{h.label}」からの変更</span>
                                                    </div>
                                                    <div className="flex gap-3 text-sm font-mono font-bold">
                                                        <span className="text-emerald-600">+{added} 行</span>
                                                        <span className="text-red-500">-{removed} 行</span>
                                                    </div>
                                                </div>
                                                <div className="font-mono text-xs rounded-xl overflow-hidden border border-slate-200">
                                                    {diff.map((d, idx) => (
                                                        <div
                                                            key={idx}
                                                            className={cn(
                                                                "px-3 py-0.5 leading-relaxed whitespace-pre-wrap break-words",
                                                                d.type === 'added' ? "bg-emerald-50 text-emerald-800 border-l-2 border-emerald-400" :
                                                                d.type === 'removed' ? "bg-red-50 text-red-700 border-l-2 border-red-400 line-through opacity-70" :
                                                                "text-slate-600"
                                                            )}
                                                        >
                                                            <span className="mr-2 opacity-40 select-none">
                                                                {d.type === 'added' ? '+' : d.type === 'removed' ? '-' : '\u00A0'}
                                                            </span>
                                                            {d.line || '\u00A0'}
                                                        </div>
                                                    ))}
                                                </div>
                                                <button
                                                    onClick={() => {
                                                        if (window.confirm(`v${diffTarget + 1}「${h.label}」の内容に戻しますか？`)) {
                                                            setGeneratedPlan(h.plan);
                                                            setShowHistoryModal(false);
                                                            setDiffTarget(null);
                                                        }
                                                    }}
                                                    className="flex items-center gap-2 px-4 py-2 bg-violet-100 text-violet-700 hover:bg-violet-200 rounded-lg text-sm font-bold transition-colors"
                                                >
                                                    <RotateCcw className="w-4 h-4" /> このバージョンに戻す
                                                </button>
                                            </div>
                                        );
                                    })() : (
                                        <div className="h-full flex flex-col items-center justify-center text-slate-300 space-y-3">
                                            <History className="w-12 h-12 opacity-20" />
                                            <p className="text-center text-sm">左のバージョンを選択すると<br />差分が表示されます</p>
                                        </div>
                                    )}
                                </div>
                            </div>
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* ===== 先生パーソナライズ 入力モーダル ===== */}
            <AnimatePresence>
                {showTeacherModal && (
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/70 backdrop-blur-sm p-4"
                        onClick={(e) => { if (e.target === e.currentTarget) applyTeacherProfile(); }}
                    >
                        <motion.div
                            initial={{ scale: 0.95, y: 30, opacity: 0 }}
                            animate={{ scale: 1, y: 0, opacity: 1 }}
                            exit={{ scale: 0.95, y: 30, opacity: 0 }}
                            transition={{ type: 'spring', stiffness: 300, damping: 30 }}
                            className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col overflow-hidden"
                        >
                            {/* モーダルヘッダー */}
                            <div className="bg-gradient-to-r from-pink-500 to-rose-600 px-6 py-5 flex items-center justify-between shrink-0">
                                <div>
                                    <h2 className="text-xl font-bold text-white flex items-center gap-2">
                                        <Heart className="w-5 h-5" /> 先生のこだわり・パーソナライズ
                                    </h2>
                                    <p className="text-pink-100 text-sm mt-0.5">
                                        入力した内容はAIが単元計画に最大限反映します。音声入力対応 🎤
                                    </p>
                                </div>
                                <button onClick={applyTeacherProfile} className="p-2 hover:bg-white/20 rounded-full transition-colors">
                                    <X className="w-5 h-5 text-white" />
                                </button>
                            </div>

                            {/* 質問リスト（スクロール） */}
                            <div className="overflow-y-auto flex-1 p-5 space-y-5">
                                {TEACHER_QUESTIONS.map((q) => {
                                    const isListening = listeningKey === q.key;
                                    return (
                                        <div key={q.key} className="bg-slate-50 rounded-xl border border-slate-200 p-4 space-y-2">
                                            {/* 質問文 */}
                                            <div className="flex items-start justify-between gap-3">
                                                <label className="text-sm font-bold text-slate-700 flex items-center gap-1.5 leading-snug">
                                                    <span className="text-base">{q.icon}</span>
                                                    {q.question}
                                                </label>
                                                {/* 音声入力ボタン */}
                                                <button
                                                    onClick={() => toggleVoice(q.key)}
                                                    title={isListening ? '録音を停止' : '音声入力を開始'}
                                                    className={cn(
                                                        "shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all border",
                                                        isListening
                                                            ? "bg-red-500 text-white border-red-500 animate-pulse"
                                                            : "bg-white text-slate-500 border-slate-200 hover:border-pink-400 hover:text-pink-600"
                                                    )}
                                                >
                                                    {isListening
                                                        ? <><MicOff className="w-3.5 h-3.5" /> 停止</>
                                                        : <><Mic className="w-3.5 h-3.5" /> 音声入力</>
                                                    }
                                                </button>
                                            </div>

                                            {/* テキストエリア */}
                                            <div className="relative">
                                                <textarea
                                                    value={teacherProfile[q.key] || ''}
                                                    onChange={(e) => updateTeacherProfile(q.key, e.target.value)}
                                                    placeholder={q.placeholder}
                                                    rows={3}
                                                    className={cn(
                                                        "w-full px-3 py-2.5 rounded-lg border text-sm resize-none focus:outline-none focus:ring-2 transition-all",
                                                        isListening
                                                            ? "border-red-300 ring-2 ring-red-200 bg-red-50"
                                                            : "border-slate-200 focus:ring-pink-300 bg-white"
                                                    )}
                                                />
                                                {isListening && (
                                                    <div className="absolute bottom-2 right-2 flex items-center gap-1 text-red-500 text-xs font-bold">
                                                        <span className="w-2 h-2 rounded-full bg-red-500 animate-ping inline-block" />
                                                        録音中
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>

                            {/* フッター */}
                            <div className="shrink-0 px-5 py-4 border-t border-slate-100 bg-slate-50 flex items-center justify-between gap-3">
                                <p className="text-xs text-slate-500">
                                    入力内容はブラウザに自動保存されます
                                </p>
                                <button
                                    onClick={applyTeacherProfile}
                                    className="flex items-center gap-2 bg-gradient-to-r from-pink-500 to-rose-600 text-white px-6 py-2.5 rounded-xl font-bold text-sm shadow-md hover:shadow-lg transition-all transform active:scale-95"
                                >
                                    <CheckCircle2 className="w-4 h-4" />
                                    反映して閉じる
                                </button>
                            </div>
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
};

export default PlanGenerator;
