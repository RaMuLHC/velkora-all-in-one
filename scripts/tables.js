// ==========================================
// 危殼：數據與文案配置檔 (Data Tables)
// 將所有長文本替換為 i18n 鍵值，以支援多語言本地化
// ==========================================

// 將資料掛載到 Foundry 原生的 CONFIG 命名空間下，確保全域可用
CONFIG.Velkora = CONFIG.Velkora || {};

// ==========================================
// 1. 屏障破裂表 (Veil Breaching Tables)
// ==========================================
CONFIG.Velkora.ANOMALY_TABLES = {
    light: {
        1: "VELKORA.Anomalies.Breach.light.1",
        2: "VELKORA.Anomalies.Breach.light.2",
        3: "VELKORA.Anomalies.Breach.light.3",
        4: "VELKORA.Anomalies.Breach.light.4",
        5: "VELKORA.Anomalies.Breach.light.5",
        6: "VELKORA.Anomalies.Breach.light.6"
    },
    moderate: {
        1: "VELKORA.Anomalies.Breach.moderate.1",
        2: "VELKORA.Anomalies.Breach.moderate.2",
        3: "VELKORA.Anomalies.Breach.moderate.3",
        4: "VELKORA.Anomalies.Breach.moderate.4",
        5: "VELKORA.Anomalies.Breach.moderate.5",
        6: "VELKORA.Anomalies.Breach.moderate.6"
    },
    severe: {
        1: "VELKORA.Anomalies.Breach.severe.1",
        2: "VELKORA.Anomalies.Breach.severe.2",
        3: "VELKORA.Anomalies.Breach.severe.3",
        4: "VELKORA.Anomalies.Breach.severe.4",
        5: "VELKORA.Anomalies.Breach.severe.5",
        6: "VELKORA.Anomalies.Breach.severe.6"
    }
};

// ==========================================
// 2. 臨界點反常表 (Critical Anomalies)
// ==========================================
CONFIG.Velkora.CRITICAL_ANOMALIES = {
    1: "VELKORA.Anomalies.Critical.1",
    2: "VELKORA.Anomalies.Critical.2",
    3: "VELKORA.Anomalies.Critical.3",
    4: "VELKORA.Anomalies.Critical.4",
    5: "VELKORA.Anomalies.Critical.5",
    6: "VELKORA.Anomalies.Critical.6",
    7: "VELKORA.Anomalies.Critical.7",
    8: "VELKORA.Anomalies.Critical.8"
};

// ==========================================
// 3. 四季律動表 (Primal Rhythm)
// ==========================================
CONFIG.Velkora.PRIMAL_RHYTHM = {
    1: {
        name: "VELKORA.Rhythm.Spring.name",
        harmony: "VELKORA.Rhythm.Spring.harmony",
        pulse: "VELKORA.Rhythm.Spring.pulse"
    },
    2: {
        name: "VELKORA.Rhythm.Summer.name",
        harmony: "VELKORA.Rhythm.Summer.harmony",
        pulse: "VELKORA.Rhythm.Summer.pulse"
    },
    3: {
        name: "VELKORA.Rhythm.Autumn.name",
        harmony: "VELKORA.Rhythm.Autumn.harmony",
        pulse: "VELKORA.Rhythm.Autumn.pulse"
    },
    4: {
        name: "VELKORA.Rhythm.Winter.name",
        harmony: "VELKORA.Rhythm.Winter.harmony",
        pulse: "VELKORA.Rhythm.Winter.pulse"
    }
};