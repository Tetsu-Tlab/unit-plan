import React, { useState, useEffect, useRef } from 'react';
import { useApiKeyBridge } from '../hooks/useApiKeyBridge';
import { BookOpen, Settings, School, GraduationCap, FileText, Upload, Sparkles, AlertCircle, Save, Heart, X, File as FileIcon } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '../lib/utils';
import mammoth from 'mammoth';
import { exportToWord } from '../lib/docxExport';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { saveAs } from 'file-saver';

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

    // Research & Local Context
    const [researchTheme, setResearchTheme] = useState('');
    const [teacherFocus, setTeacherFocus] = useState(''); // New: 先生のこだわり

    // Files & Resources
    const [guideContent, setGuideContent] = useState(''); // Text content
    const [attachedFiles, setAttachedFiles] = useState([]); // Array of { name, type, data (base64) }
    const fileInputRef = useRef(null);
    const previewRef = useRef(null);

    // Generation State
    const [generatedPlan, setGeneratedPlan] = useState('');
    const [isLoading, setIsLoading] = useState(false);

    const toggleAi = () => {
        const next = !aiEnabled;
        setAiEnabled(next);
        localStorage.setItem('unitplan_ai_enabled', String(next));
    };

    useEffect(() => {
        if (apiKey) setShowSettings(false);
    }, [apiKey]);

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

## 重要な制約事項
提供された「学習指導要領」や「教材テキスト」の内容（添付ファイルやテキスト入力）を**最優先**し、そこから該当する単元の範囲を特定して、内容に矛盾しない計画を立ててください。

## 先生からのリクエスト・重視する点（最重要）
「${teacherFocus || '特になし'}」
※この点を単元の目標や評価、授業の展開に色濃く反映させてください。

## 校内研究テーマ
「${researchTheme || '特になし'}」

## 単元基本情報
- 校種: ${schoolType === 'elementary' ? '小学校' : '中学校'}
- 学年: ${grade}
- 教科: ${subject}
- 単元名: ${unitName}
- 学級タイプ: ${classType}
  ${classType === 'regular' ? '(通常学級 - UD視点での支援を記述)' : '(特別支援学級 - 特性に合わせた具体的かつ手厚い支援を記述)'}

## 追加テキスト情報
${guideContent}

## 出力フォーマット
Markdown形式で出力してください。
1. **単元設定の理由** (先生のこだわりや研究テーマとの関連、児童の実態分析を含む)
2. **単元の目標** (知識・技能 / 思考・判断・表現 / 主体的に学習に取り組む態度)
3. **単元指導計画表** (Table形式)
   カラム: [時, 学習活動（児童・生徒の変容）, 指導上の留意点・支援（教師の手立て）, 評価（規準と方法）, UD・個別支援]

`;

            // Construct Payload
            const parts = [{ text: systemPrompt }];

            // Append PDF files as inline data
            attachedFiles.forEach(file => {
                parts.push({
                    inlineData: {
                        mimeType: file.mimeType,
                        data: file.data
                    }
                });
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
            setGeneratedPlan(text);

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
        await exportToWord(fileName, generatedPlan, {
            schoolType, grade, subject, unitName, researchTheme, teacherFocus
        });
    };

    const handleTextExport = () => {
        if (!generatedPlan) return;
        const fileName = `${grade || ''}${subject || ''}_${unitName || '単元計画'}.txt`;
        const blob = new Blob([generatedPlan], { type: "text/plain;charset=utf-8" });
        saveAs(blob, fileName);
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
                researchTheme, teacherFocus
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

            <main className="max-w-7xl mx-auto px-6 py-8 grid grid-cols-1 lg:grid-cols-12 gap-8">

                {/* Left Column: Inputs */}
                <div className="lg:col-span-5 space-y-6">

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
                        <div className="bg-gradient-to-br from-indigo-600 to-violet-700 rounded-xl shadow-float text-white p-6 relative overflow-hidden group">
                            <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
                                <School className="w-24 h-24" />
                            </div>
                            <h2 className="text-lg font-bold mb-1 flex items-center gap-2 relative z-10 text-white">
                                <School className="w-5 h-5" /> 校内研究テーマ
                            </h2>
                            <textarea
                                value={researchTheme}
                                onChange={(e) => setResearchTheme(e.target.value)}
                                placeholder="例：自ら問いを見出し、協働して解決する児童の育成"
                                className="w-full mt-2 px-3 py-2 bg-white/10 border border-white/20 rounded-lg text-white placeholder-indigo-200 focus:ring-2 focus:ring-white/50 focus:outline-none transition-all resize-none h-20 relative z-10 text-sm"
                            />
                        </div>

                        <div className="bg-gradient-to-br from-pink-500 to-rose-600 rounded-xl shadow-float text-white p-6 relative overflow-hidden group">
                            <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
                                <Heart className="w-24 h-24" />
                            </div>
                            <h2 className="text-lg font-bold mb-1 flex items-center gap-2 relative z-10 text-white">
                                <Heart className="w-5 h-5" /> 先生のこだわり・重点
                            </h2>
                            <textarea
                                value={teacherFocus}
                                onChange={(e) => setTeacherFocus(e.target.value)}
                                placeholder="この単元で特に大切にしたいこと、育てたい力、クラスの実態など..."
                                className="w-full mt-2 px-3 py-2 bg-white/10 border border-white/20 rounded-lg text-white placeholder-pink-200 focus:ring-2 focus:ring-white/50 focus:outline-none transition-all resize-none h-20 relative z-10 text-sm"
                            />
                        </div>
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

                {/* Right Column: Output */}
                <div className="lg:col-span-7 flex flex-col gap-4 sticky top-24 h-[calc(100vh-8rem)]">

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
                    <div className="bg-white rounded-xl shadow-premium border border-slate-100 flex-grow flex flex-col overflow-hidden">
                        <div className="p-4 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
                            <h3 className="font-bold text-slate-700">生成プレビュー</h3>
                            {generatedPlan && (
                                <button
                                    onClick={() => navigator.clipboard.writeText(generatedPlan)}
                                    className="text-xs flex items-center gap-1 text-slate-400 hover:text-indigo-600 font-medium px-2 py-1 rounded transition-colors"
                                >
                                    <Save className="w-3 h-3" /> Markdownコピー
                                </button>
                            )}
                        </div>
                        <div className="p-8 flex-grow overflow-y-auto">
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
                </div>

            </main>
        </div>
    );
};

export default PlanGenerator;
