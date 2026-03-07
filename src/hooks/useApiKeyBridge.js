/**
 * ANTIGRAVITY API Key Bridge
 *
 * ポータルから各アプリへAPIキーを届けるブリッジフック。
 * このファイルを各アプリの src/hooks/ にコピーして import するだけで動く。
 *
 * 受け取り方（優先順位）：
 *   1. URLパラメータ ?apiKey=xxx  （ポータルがiframeを開く時に付与）
 *   2. postMessage                （iframeロード後にポータルから送信）
 *   3. localStorage               （前回保存済みの値）
 */
import { useState, useEffect } from 'react';

// 全アプリで統一するlocalStorageキー名
const STORAGE_KEY = 'geminiApiKey';

export function useApiKeyBridge() {
    const [apiKey, setApiKey] = useState(() => {
        // 起動時：URLパラメータを最優先でチェック
        const params = new URLSearchParams(window.location.search);
        const urlKey = params.get('apiKey');
        if (urlKey) {
            // URLから取得できたらlocalStorageにも保存（統一キー名で）
            localStorage.setItem(STORAGE_KEY, urlKey);
            return urlKey;
        }
        // なければlocalStorageから読む（旧キー名gemini_api_keyも移行）
        const legacy = localStorage.getItem('gemini_api_key');
        if (legacy) {
            localStorage.setItem(STORAGE_KEY, legacy);
            return legacy;
        }
        return localStorage.getItem(STORAGE_KEY) || '';
    });

    useEffect(() => {
        // postMessageでポータルからAPIキーが届いた時の処理
        // ANTIGRAVITY_SYNC（Nova Lab Pro標準）と ANTIGRAVITY_API_KEY の両方に対応
        const handleMessage = (event) => {
            const { type, apiKey: key } = event.data || {};
            if ((type === 'ANTIGRAVITY_SYNC' || type === 'ANTIGRAVITY_API_KEY') && key) {
                setApiKey(key);
                localStorage.setItem(STORAGE_KEY, key);
            }
        };

        window.addEventListener('message', handleMessage);
        return () => window.removeEventListener('message', handleMessage);
    }, []);

    // アプリ内でユーザーが手動で入力した時の保存関数
    const saveApiKey = (key) => {
        setApiKey(key);
        localStorage.setItem(STORAGE_KEY, key);
    };

    return { apiKey, saveApiKey };
}
