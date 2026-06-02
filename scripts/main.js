// ==========================================
// 危殼：自動化合集包 (Module 核心腳本)
// 包含：HUD 監控面板、屏障縫合攔截、過載施法全自動結算、HUD日誌化、內聯撤銷
// 升級：V6.8 (死秋改在RollComplete直接修正HP、按鈕改用原生 DOM)
// 系統命名空間：velkora-all-in-one
// ==========================================

const SCRIPT_VERSION = "V7.8";

// ==========================================
// 🌿 原初施法者判定輔助函數 (Primal Caster Check)
// ==========================================
function isPrimalCaster(actor) {
    if (!actor) return false;
    if (actor.classes?.druid || actor.classes?.ranger) return true;
    if (typeof actor.items?.some === "function") {
        return actor.items.some(i => {
            if (i.type !== "class") return false;
            const id = (i.identifier || i.system?.identifier || "").toLowerCase();
            const name = (i.name || "").toLowerCase();
            return id.includes("druid") || id.includes("ranger") || 
                   name.includes("德魯伊") || name.includes("遊俠") || 
                   name.includes("druid") || name.includes("ranger");
        });
    }
    return false;
}

// ==========================================
// ⚙️ 除錯模式與日誌封裝 (Debug Mode & Logging Wrapper)
// ==========================================
function log(message, level = "info", force = false, style = null) {
    if (!force) {
        let debugEnabled = false;
        try {
            debugEnabled = game.settings.get("velkora-all-in-one", "debugMode");
        } catch (e) {
            // Safe fallback during early init hook
        }
        if (!debugEnabled) return;
    }

    if (style) {
        console.log(message, style);
        return;
    }

    const prefix = `[Velkora : All in one ${SCRIPT_VERSION}]`;
    switch (level) {
        case "error":
            console.error(`${prefix} ❌ ${message}`);
            break;
        case "warn":
            console.warn(`${prefix} ⚠️ ${message}`);
            break;
        case "debug":
            console.debug(`${prefix} 🔍 ${message}`);
            break;
        case "info":
        default:
            console.log(`${prefix} ${message}`);
            break;
    }
}

// ==========================================
// 🩹 jQuery HTML Hook Compatibility Patch (Fixes html.find is not a function in v12 for item-piles etc.)
// ==========================================
function wrapChatMessageHookCallback(fn) {
    if (typeof fn !== "function") return fn;
    if (fn.isWrappedForJQueryHTML) return fn;
    const wrapped = function(message, html, data) {
        if (html && (html instanceof Node) && typeof jQuery !== "undefined") {
            // Add jQuery compatibility methods directly to the Node instance if not present
            const methods = ["find", "hasClass", "addClass", "removeClass", "toggleClass", "attr", "removeAttr", "css", "data", "val", "html", "text", "empty", "remove", "append", "prepend", "on", "off", "click"];
            for (const method of methods) {
                if (!(method in html)) {
                    try {
                        html[method] = function(...args) {
                            const jq = jQuery(html);
                            return jq[method].apply(jq, args);
                        };
                    } catch (e) {
                        // Safe fallback if some node types or environments restrict modifications
                    }
                }
            }
        }
        return fn.call(this, message, html, data);
    };
    wrapped.isWrappedForJQueryHTML = true;
    wrapped.originalFn = fn;
    return wrapped;
}

function applyJQueryHtmlHooksPatch() {
    const hooksToPatch = ["renderChatMessageHTML", "renderChatMessage"];
    
    // Patch existing registrations
    if (typeof Hooks !== "undefined" && Hooks.events) {
        for (const hookName of hooksToPatch) {
            const listeners = Hooks.events[hookName];
            if (Array.isArray(listeners)) {
                for (const listener of listeners) {
                    if (listener && typeof listener.fn === "function") {
                        listener.fn = wrapChatMessageHookCallback(listener.fn);
                    }
                }
            }
        }
    }

    // Intercept future registrations
    if (typeof Hooks !== "undefined") {
        const originalOn = Hooks.on;
        if (originalOn) {
            Hooks.on = function(hookName, fn, ...args) {
                if (hooksToPatch.includes(hookName)) {
                    fn = wrapChatMessageHookCallback(fn);
                }
                return originalOn.call(this, hookName, fn, ...args);
            };
        }

        const originalOnce = Hooks.once;
        if (originalOnce) {
            Hooks.once = function(hookName, fn, ...args) {
                if (hooksToPatch.includes(hookName)) {
                    fn = wrapChatMessageHookCallback(fn);
                }
                return originalOnce.call(this, hookName, fn, ...args);
            };
        }
    }
    
    log("🩹 Applied jQuery compatibility patch for renderChatMessage/renderChatMessageHTML hooks.", "info", true);
}

// Apply the patch immediately when script loads to catch any early hook registrations
applyJQueryHtmlHooksPatch();

Hooks.once("init", () => {
    // Also re-apply during init hook to catch any hooks registered concurrently
    applyJQueryHtmlHooksPatch();
    // 註冊除錯模式設定
    game.settings.register("velkora-all-in-one", "debugMode", {
        name: "啟用除錯模式 (Debug Mode)",
        hint: "啟用後將在瀏覽器主控台 (Console) 輸出詳細的除錯訊息與系統狀態。",
        scope: "client",
        config: true,
        type: Boolean,
        default: false
    });

    // 註冊語言手動覆蓋設定
    game.settings.register("velkora-all-in-one", "languageOverride", {
        name: "VELKORA.Settings.LanguageOverride.Name",
        hint: "VELKORA.Settings.LanguageOverride.Hint",
        scope: "client",
        config: true,
        type: String,
        default: "auto",
        choices: {
            "auto": "VELKORA.Settings.LanguageOverride.Auto",
            "en": "English",
            "zh-tw": "繁體中文 (Traditional Chinese)",
            "zh-cn": "简体中文 (Simplified Chinese)"
        },
        onChange: () => {
            foundry.utils.debouncedReload();
        }
    });

    log(`%c[Velkora : All in one] 🚀 Core Module Loading... Current Script Version: ${SCRIPT_VERSION}`, "info", true, "color: #00FF00; font-size: 16px; font-weight: bold; background: #000; padding: 5px 10px; border-radius: 5px;");

    game.settings.register("velkora-all-in-one", "stressValue", { scope: "world", config: true, type: Number, default: 0 });
    game.settings.register("velkora-all-in-one", "baseThreshold", { scope: "world", config: true, type: Number, default: 10 });
    game.settings.register("velkora-all-in-one", "envModifier", { scope: "world", config: true, type: Number, default: 0 });
    game.settings.register("velkora-all-in-one", "scabCount", { scope: "world", config: true, type: Number, default: 0 });
    
    game.settings.register("velkora-all-in-one", "hudLogs", { scope: "world", config: false, type: Array, default: [] });
    game.settings.register("velkora-all-in-one", "undoState", { scope: "world", config: false, type: Object, default: {} });
});

Hooks.once("setup", async () => {
    try {
        const override = game.settings.get("velkora-all-in-one", "languageOverride");
        if (override && override !== "auto") {
            const langPath = `modules/velkora-all-in-one/lang/${override}.json`;
            const response = await fetch(langPath);
            if (response.ok) {
                const translations = await response.json();
                foundry.utils.mergeObject(game.i18n.translations, translations);
                log(`已手動套用語系覆蓋為: ${override}`, "info");
            }
        }
    } catch (e) {
        log(`加載語系覆蓋檔案失敗: ${e.message}`, "error");
    }
});

Hooks.once("ready", async () => {
    if (game.user.isGM) {
        await autoAddVeilFeatures();
        globalThis.openVeilHUD = showVeilHUD;
    }

    // 註冊 Socket 通訊監聽器 (GM 專用後台執行器)
    game.socket.on("module.velkora-all-in-one", async (data) => {
        if (!game.user.isGM) return;
        log(`[Socket] 接收到後台信號: action=${data.action}`, "info");
        if (data.action === "suture") {
            const targetActor = game.actors.get(data.actorId);
            if (targetActor) {
                await applySutureExecution(targetActor, targetActor.name, data.level);
            }
        } else if (data.action === "stress") {
            const targetActor = game.actors.get(data.actorId);
            await processStress(data.amount, data.effectiveSpellLevel, data.actorName, data.actionName, targetActor);
        }
    });

    // 註冊凜冬冰霜區域敏捷豁免按鈕的全局點擊事件委託 (Delegated Click Listener)
    document.addEventListener("click", async (ev) => {
        const btn = ev.target.closest(".roll-save-btn");
        if (!btn) return;
        ev.preventDefault();

        const tokenId = btn.dataset.tokenId;
        const dc = parseInt(btn.dataset.dc, 10);
        
        let token = canvas.tokens?.get(tokenId);
        if (!token) {
            const tokenDoc = canvas.scene?.tokens?.get(tokenId);
            token = tokenDoc?.object;
        }

        if (!token || !token.actor) {
            ui.notifications.warn(game.i18n.localize("VELKORA.Notifications.NoTokenOrActor"));
            return;
        }

        if (!token.actor.isOwner) {
            ui.notifications.warn(game.i18n.localize("VELKORA.Notifications.NoControl"));
            return;
        }

        log(`點擊了冰霜區域豁免按鈕：角色=${token.name}, 對抗DC=${dc}`, "info");
        let roll = null;
        if (typeof token.actor.rollSavingThrow === "function") {
            const result = await token.actor.rollSavingThrow({ ability: "dex" }, {}, { event: ev });
            roll = Array.isArray(result) ? result[0] : result;
        } else if (typeof token.actor.rollAbilitySave === "function") {
            roll = await token.actor.rollAbilitySave("dex", { event: ev });
        }
        if (roll) {
            const total = roll.total;
            const success = total >= dc;
            const color = success ? "#16a34a" : "#dc2626";
            const bgColor = success ? "rgba(22, 163, 74, 0.08)" : "rgba(220, 38, 38, 0.08)";
            const borderColor = success ? "#16a34a" : "#dc2626";
            const resultText = success 
                ? (game.i18n.localize("VELKORA.Chat.SaveSuccessShort") || "成功")
                : (game.i18n.localize("VELKORA.Chat.SaveFailureAction") || "失敗 (動作消耗且執行失敗！)");
            log(`豁免結果：角色=${token.name}, 骰值=${total}, 成功=${success}`, "info");

            const saveTitle = game.i18n.format("VELKORA.Chat.SaveTitle", { name: token.name, dc });
            const saveResult = game.i18n.format("VELKORA.Chat.SaveResult", { total, color, result: resultText });

            ChatMessage.create({
                speaker: ChatMessage.getSpeaker({ token: token.document || token }),
                content: `
                    <div style="background: ${bgColor}; padding: 8px; border-left: 4px solid ${borderColor}; border-radius: 3px;">
                        <strong style="color: ${borderColor};">${saveTitle}</strong>
                        <div style="margin-top: 4px;">${saveResult}</div>
                    </div>
                `
            });
        }
    });
});

// ==========================================
// ⭐ UI 入口：右側邊欄 (Settings) 頂部按鈕 (僅 GM)
// ==========================================
Hooks.on("renderSettings", (app, html, data) => {
    if (!game.user.isGM) return;

    const htmlEl = html instanceof HTMLElement ? html : html[0];
    if (!htmlEl) return;

    // Deduplication check
    if (htmlEl.querySelector("#veil-hud-sidebar-btn")) return;

    const button = document.createElement("button");
    button.id = "veil-hud-sidebar-btn";
    button.style.marginBottom = "5px";
    button.style.background = "#374151";
    button.style.color = "white";
    button.style.border = "1px solid #6b7280";
    button.style.fontWeight = "bold";
    button.style.width = "100%";
    button.style.padding = "6px";
    button.style.cursor = "pointer";
    button.style.display = "flex";
    button.style.alignItems = "center";
    button.style.justifyContent = "center";
    button.style.gap = "5px";
    button.innerHTML = `<i class="fas fa-shield-halved" style="color: #4ade80;"></i> ${game.i18n.localize("VELKORA.HUD.Title")}`;

    button.addEventListener("click", (e) => {
        e.preventDefault();
        showVeilHUD();
    });

    const settingsGame = htmlEl.querySelector("#settings-game");
    if (settingsGame) {
        settingsGame.parentNode.insertBefore(button, settingsGame);
    } else {
        htmlEl.appendChild(button);
    }
});

// ==========================================
// ⭐ UI 入口：角色卡標題按鈕 (僅原初施法者玩家)
// ==========================================
Hooks.on("getActorSheetHeaderButtons", (app, buttons) => {
    const actor = app.document;
    if (actor.type !== "character") return;
    
    const isPrimal = isPrimalCaster(actor);
    if (!isPrimal || !actor.isOwner) return;

    buttons.unshift({
        label: game.i18n.localize("VELKORA.HUD.PrimalRhythmTitle"),
        class: "open-rhythm-hud",
        icon: "fas fa-leaf",
        onclick: () => {
            globalThis.primalHUDs = globalThis.primalHUDs || {};
            if (!globalThis.primalHUDs[actor.id]) {
                globalThis.primalHUDs[actor.id] = new PrimalRhythmHUD(actor);
            }
            globalThis.primalHUDs[actor.id].render(true);
        }
    });
});

Hooks.on("updateActor", (actor, changes, options, userId) => {
    const seasonChanged = foundry.utils.getProperty(changes, "flags.velkora-all-in-one.currentSeason");
    
    if (seasonChanged !== undefined) {
        const isPrimal = isPrimalCaster(actor);
        if (!isPrimal) return;

        globalThis.primalHUDs = globalThis.primalHUDs || {};

        if (game.user.isGM) {
            if (globalThis.primalHUDs[actor.id] && globalThis.primalHUDs[actor.id].rendered) {
                globalThis.primalHUDs[actor.id].render(false);
            }
            if (globalThis.veilHUD && globalThis.veilHUD.rendered) {
                globalThis.veilHUD.render(false);
            }
            return; 
        }

        if (actor.isOwner) {
            if (!globalThis.primalHUDs[actor.id]) {
                globalThis.primalHUDs[actor.id] = new PrimalRhythmHUD(actor);
            }
            globalThis.primalHUDs[actor.id].render(true);
        }
    }
});

// ==========================================
// ⭐ 聊天指令：/veil 與 /rhythm
// ==========================================
Hooks.on("chatMessage", (chatLog, messageText, chatData) => {
    const msg = messageText.trim().toLowerCase();
    
    if (msg === "/veil") {
        if (game.user.isGM) showVeilHUD();
        else ui.notifications.warn(game.i18n.localize("VELKORA.Notifications.GmOnly"));
        return false; 
    }
    
    if (msg === "/rhythm") {
        const actor = canvas.tokens.controlled[0]?.actor || game.user.character;
        if (actor && isPrimalCaster(actor)) {
            if (!actor.isOwner) return false;
            globalThis.primalHUDs = globalThis.primalHUDs || {};
            if (!globalThis.primalHUDs[actor.id]) globalThis.primalHUDs[actor.id] = new PrimalRhythmHUD(actor);
            globalThis.primalHUDs[actor.id].render(true);
        } else {
            ui.notifications.warn(game.i18n.localize("VELKORA.Notifications.NoToken"));
        }
        return false;
    }
});

// ==========================================
// ⭐ 智能派發引擎 (Auto-Populate Items)
// ==========================================
// ==========================================
// ⭐ 智能派發引擎 (Auto-Populate Items)
// ==========================================
async function autoAddVeilFeatures() {
    log(`🛡️ 開始執行特性智能分流派發與版本對比...`, "info");
    
    const packName = "velkora-all-in-one.velkora-all-in-one-compendium";
    const pack = game.packs.get(packName);
    
    if (!pack) return;

    const index = await pack.getIndex();
    
    const sutureEntry = index.find(i => i.name === "屏障縫合");
    const rotationEntry = index.find(i => i.name === "主動輪轉");
    const overloadEntry = index.find(i => i.name === "過載施法"); 

    const itemsToFetch = [];
    if (sutureEntry) itemsToFetch.push(pack.getDocument(sutureEntry._id));
    if (rotationEntry) itemsToFetch.push(pack.getDocument(rotationEntry._id));
    if (overloadEntry) itemsToFetch.push(pack.getDocument(overloadEntry._id));
    const loadedItems = await Promise.all(itemsToFetch);

    const itemObjects = loadedItems.map(i => {
        let obj = foundry.utils.deepClone(i.toObject());
        delete obj._id;
        return obj;
    });

    const sutureObj = itemObjects.find(i => i.name === "屏障縫合");
    const rotationObj = itemObjects.find(i => i.name === "主動輪轉");
    const overloadObj = itemObjects.find(i => i.name === "過載施法");

    if (sutureObj) {
        foundry.utils.setProperty(sutureObj, "flags.velkora-all-in-one.isSuture", true);
        sutureObj.name = game.i18n.localize("VELKORA.Items.Suture.Name");
        sutureObj.system.description.value = game.i18n.localize("VELKORA.Items.Suture.Description");
        sutureObj.img = "modules/velkora-all-in-one/assets/icons/suture.svg";
    }
    if (rotationObj) {
        foundry.utils.setProperty(rotationObj, "flags.velkora-all-in-one.isRotation", true);
        rotationObj.name = game.i18n.localize("VELKORA.Items.Rotation.Name");
        rotationObj.system.description.value = game.i18n.localize("VELKORA.Items.Rotation.Description");
        rotationObj.img = "modules/velkora-all-in-one/assets/icons/rotation.svg";
    }
    if (overloadObj) {
        foundry.utils.setProperty(overloadObj, "flags.velkora-all-in-one.isOverload", true);
        overloadObj.name = game.i18n.localize("VELKORA.Items.Overload.Name");
        overloadObj.system.description.value = game.i18n.localize("VELKORA.Items.Overload.Description");
        overloadObj.img = "modules/velkora-all-in-one/assets/icons/overload.svg";
    }

    const characters = game.actors.filter(a => a.type === "character");
    const globalUpdateMessages = []; 

    for (let actor of characters) {
        const spells = actor.system?.spells || {};
        const hasSlots = Object.keys(spells).some(key => spells[key]?.max > 0);
        const hasCasterClass = actor.items.some(i => i.type === "class" && i.system?.spellcasting?.progression && i.system.spellcasting.progression !== "none");
        
        if (!hasSlots && !hasCasterClass) continue;

        const isPrimal = isPrimalCaster(actor);
        const toCreate = [];
        const toDelete = [];

        const checkAndPrepareItem = (compendiumObj, flagKey, exactName) => {
            if (!compendiumObj) return;
            const existingItem = actor.items.find(i => 
                i.flags?.["velkora-all-in-one"]?.[flagKey] || 
                i.name === compendiumObj.name || 
                (flagKey === "isRotation" && (
                    i.name.startsWith(compendiumObj.name) || 
                    i.name.startsWith("主動輪轉") || 
                    i.name.startsWith("主动轮转") || 
                    i.name.startsWith("Active Rotation") || 
                    i.name.startsWith("Primal Rhythm Rotation")
                )) ||
                (flagKey === "isSuture" && (i.name === "屏障縫合" || i.name === "屏障缝合" || i.name === "Veil Suture" || i.name === "Barrier Suture")) ||
                (flagKey === "isOverload" && (i.name === "過載施法" || i.name === "过载施法" || i.name === "Overload Casting"))
            );

            if (!existingItem) {
                toCreate.push(foundry.utils.deepClone(compendiumObj));
                globalUpdateMessages.push(game.i18n.format("VELKORA.Chat.ItemDispatched", { item: compendiumObj.name, actor: actor.name }));
            } else {
                const typeChanged = existingItem.type !== compendiumObj.type;
                const existingSystem = JSON.stringify(existingItem.system || {});
                const compSystem = JSON.stringify(compendiumObj.system || {});
                const existingEffectsCount = existingItem.effects?.size || existingItem.effects?.length || 0;
                const compEffectsCount = compendiumObj.effects?.length || 0;
                const imgChanged = existingItem.img !== compendiumObj.img;

                // 對於主動輪轉，我們忽略 system.description 和 name 的比對，因為它們會隨著季節動態改變
                let isMatch = true;
                if (flagKey === "isRotation") {
                    isMatch = !typeChanged && (existingEffectsCount === compEffectsCount) && !imgChanged;
                } else {
                    isMatch = !typeChanged && (existingSystem === compSystem) && (existingEffectsCount === compEffectsCount) && !imgChanged;
                }

                if (!isMatch) {
                    toDelete.push(existingItem.id);
                    toCreate.push(foundry.utils.deepClone(compendiumObj));
                    globalUpdateMessages.push(game.i18n.format("VELKORA.Chat.ItemUpdated", { item: compendiumObj.name, actor: actor.name }));
                }
            }
        };

        if (isPrimal) {
            checkAndPrepareItem(rotationObj, "isRotation", "主動輪轉");
            // 清理可能殘留的非原初特性
            const toRemove = actor.items.filter(i => 
                i.flags?.["velkora-all-in-one"]?.isSuture || i.name === "屏障縫合" || i.name === "屏障缝合" || i.name === "Veil Suture" || i.name === "Barrier Suture" ||
                i.flags?.["velkora-all-in-one"]?.isOverload || i.name === "過載施法" || i.name === "过载施法" || i.name === "Overload Casting"
            ).map(i => i.id);
            if (toRemove.length > 0) toDelete.push(...toRemove);
        } else {
            checkAndPrepareItem(sutureObj, "isSuture", "屏障縫合");
            checkAndPrepareItem(overloadObj, "isOverload", "過載施法");
            // 清理可能殘留的原初特性
            const toRemove = actor.items.filter(i => 
                i.flags?.["velkora-all-in-one"]?.isRotation || 
                i.name.startsWith("主動輪轉") || i.name.startsWith("主动轮转") || i.name.startsWith("Active Rotation") || i.name.startsWith("Primal Rhythm Rotation")
            ).map(i => i.id);
            if (toRemove.length > 0) toDelete.push(...toRemove);
        }
        
        if (toDelete.length > 0) {
            try {
                await actor.deleteEmbeddedDocuments("Item", toDelete);
            } catch (e) {
                log(`刪除舊特性物品時出錯：${e.message}`, "warn");
            }
        }
        if (toCreate.length > 0) {
            await actor.createEmbeddedDocuments("Item", toCreate);
        }
    }

    if (globalUpdateMessages.length > 0) {
        const titleText = game.i18n.localize("VELKORA.Chat.ItemUpdateTitle") || "🔄 特性派發與更新通知";
        const systemAlias = game.i18n.localize("VELKORA.Chat.SystemName") || "危殼系統";
        ChatMessage.create({
            speaker: { alias: systemAlias },
            content: `<div style="background: rgba(22, 163, 74, 0.08); padding: 8px; border-left: 4px solid #16a34a; border-radius: 3px;">
                        <h3 style="color: #16a34a; margin:0; border-bottom:1px solid rgba(22, 163, 74, 0.2); padding-bottom:4px; margin-bottom:6px; font-weight: bold;">${titleText}</h3>
                        <ul style="margin: 0; padding-left: 20px; font-size: 0.9em; line-height: 1.4;">
                            <li>${globalUpdateMessages.join("</li><li>")}</li>
                        </ul>
                      </div>`,
            whisper: ChatMessage.getWhisperRecipients("GM")
        });
    }
}

// ==========================================
// ⭐ 核心律動管理：季節變更與同諧 (被動) 刷新
// ==========================================
// ==========================================
// ⭐ 核心律動管理：季節變更與同諧 (被動) 刷新
// ==========================================
async function setActorSeason(actor, newSeason, reason = "輪轉") {
    const rhythmTable = CONFIG.Velkora?.PRIMAL_RHYTHM;
    if (!rhythmTable) return;

    const seasonData = rhythmTable[newSeason];
    if (!seasonData) return;

    const localizedSeasonName = game.i18n.localize(seasonData.name);
    const localizedHarmony = game.i18n.localize(seasonData.harmony);
    const localizedPulse = game.i18n.localize(seasonData.pulse);

    log(`設定角色季節：角色=${actor.name}, 新季節=${newSeason} (${localizedSeasonName}), 觸發原因=${reason}`, "info");

    const oldHarmonies = actor.effects.filter(e => e.flags?.["velkora-all-in-one"]?.isHarmony);
    if (oldHarmonies.length > 0) {
        try {
            await actor.deleteEmbeddedDocuments("ActiveEffect", oldHarmonies.map(e => e.id));
        } catch (e) {
            // Silently ignore if already deleted
        }
    }

    const icons = {
        1: "icons/magic/nature/leaf-glow-green.webp",         
        2: "icons/magic/nature/symbol-sun-yellow.webp",     
        3: "icons/magic/nature/leaf-glow-maple-orange.webp",       
        4: "icons/magic/water/snowflake-ice-blue.webp"        
    };

    const changes = {
        1: [
            { key: "flags.midi-qol.range.mwak", mode: 2, value: "5" },
            { key: "flags.midi-qol.range.msak", mode: 2, value: "5" }
        ],
        2: [
            { key: "system.attributes.movement.walk", mode: 2, value: "10" }
        ],
        3: [
            { key: "system.traits.dr.value", mode: 0, value: "necrotic" }
        ],
        4: [
            { key: "system.traits.ci.value", mode: 0, value: "prone" }
        ]
    };

    const harmonyPrefix = game.i18n.localize("VELKORA.Chat.SeasonalHarmony").split(" (")[0];
    const harmonyLabel = harmonyPrefix.includes("Seasonal") ? "Seasonal Harmony" : harmonyPrefix;

    const effectData = {
        name: `${harmonyLabel}：${localizedSeasonName}`,
        img: icons[newSeason],
        flags: { "velkora-all-in-one": { isHarmony: true, season: newSeason } },
        changes: changes[newSeason] || []
    };

    await actor.createEmbeddedDocuments("ActiveEffect", [effectData]);
    await actor.setFlag("velkora-all-in-one", "currentSeason", newSeason);

    // 尋找 actor 的「主動輪轉」物品並更新其名稱與描述
    try {
        const rotationItem = actor.items.find(i => 
            i.flags?.["velkora-all-in-one"]?.isRotation || 
            i.name === "主動輪轉" || i.name.startsWith("主動輪轉") ||
            i.name === "主动轮转" || i.name.startsWith("主动轮转") ||
            i.name === "Active Rotation" || i.name.startsWith("Active Rotation")
        );
        if (rotationItem) {
            const activeRotationLabel = game.i18n.localize("VELKORA.HUD.ActiveRotation");
            const currentSeasonLabel = game.i18n.localize("VELKORA.Chat.CurrentSeason");
            const harmonyTitle = game.i18n.localize("VELKORA.Chat.SeasonalHarmony").replace(/\s*\(.*\)/, "");
            const pulseTitle = game.i18n.localize("VELKORA.Chat.SeasonalPulse").replace(/\s*\(.*\)/, "");
            const hintText = game.i18n.localize("VELKORA.Items.Rotation.AutoUpdateHint");

            const updateData = {
                name: `${activeRotationLabel} (${localizedSeasonName})`,
                "system.description.value": `
                    <div style="background: rgba(59, 130, 246, 0.05); padding: 10px; border-left: 4px solid #3b82f6; border-radius: 4px; margin-bottom: 10px;">
                        <h3 style="color: #60a5fa; margin: 0 0 8px 0; font-weight: bold; border-bottom: 1px solid rgba(96, 165, 250, 0.2); padding-bottom: 4px;">🌿 ${currentSeasonLabel}：${localizedSeasonName}</h3>
                        <div style="margin-bottom: 8px;">
                            <strong style="color: #9ca3af;"><i class="fas fa-wind"></i> ${harmonyTitle}</strong>
                            <div style="color: #d1d5db; margin-top: 2px;">${localizedHarmony}</div>
                        </div>
                        <div>
                            <strong style="color: #9ca3af;"><i class="fas fa-bolt"></i> ${pulseTitle}</strong>
                            <div style="color: #d1d5db; margin-top: 2px;">${localizedPulse}</div>
                        </div>
                    </div>
                    <p style="color: gray; font-size: 0.9em; margin-top: 10px; font-style: italic;">(${hintText})</p>
                `
            };
            await rotationItem.update(updateData);
            log(`已更新 ${actor.name} 的「主動輪轉」物品為季節：${localizedSeasonName}`, "info");
        }
    } catch (e) {
        log(`更新「主動輪轉」物品時出錯：${e.message}`, "warn");
    }

    const reasonLabel = game.i18n.localize(`VELKORA.Chat.RotationReason.${reason === "輪轉" ? "Active" : reason === "施法共鳴" ? "Cast" : reason === "主動輪換" ? "Active" : reason === "開戰先攻" ? "Init" : reason === "手動覆蓋" ? "Override" : reason === "神聖遙控" ? "GmControl" : "Active"}`) || reason;
    const rotationTitle = game.i18n.format("VELKORA.Chat.RotationTitle", { reason: reasonLabel });
    const rotationBody = game.i18n.localize("VELKORA.Chat.RotationBody");
    const harmonyActiveText = game.i18n.localize("VELKORA.Chat.HarmonyActive");

    ChatMessage.create({
        speaker: ChatMessage.getSpeaker({ actor: actor }),
        content: `
            <div style="background: rgba(59, 130, 246, 0.08); padding: 8px; border-left: 4px solid #3b82f6; border-radius: 3px;">
                <h3 style="color: #1d4ed8; margin:0 0 4px 0; font-weight: bold;">${rotationTitle}</h3>
                <p style="margin: 0;">${rotationBody}<b style="font-size:1.1em;">${localizedSeasonName}</b></p>
                <div style="margin-top: 6px; font-size: 0.9em; background: rgba(0,0,0,0.03); padding: 5px; border-radius: 3px; border: 1px solid rgba(0,0,0,0.08);">
                    <strong style="color: #1e3a8a;"><i class="fas fa-wind"></i> ${harmonyActiveText}</strong>
                    <div style="margin-top: 2px;">${localizedHarmony}</div>
                </div>
            </div>
        `
    });
}

// ==========================================
// ⭐ 核心律動管理：季節脈衝 (主動) 攔截 (V6.6 狂夏自動化)
// ==========================================
const applySummerPulse = (config, dialog, message) => {
    // 防止重複執行（例如同時觸發 preRollDamage 與 preRollDamageV2）
    if (!config || config._summerPulseApplied) return;

    // 相容 v5 (config.subject 是 activity) 與 v3 (第一參數是 activity)
    const activity = config.subject || config;
    const actor = activity?.actor;
    const item = activity?.item;
    if (!actor || item?.type !== "spell") return;
    
    const isPrimal = isPrimalCaster(actor);
    const currentSeason = actor.getFlag("velkora-all-in-one", "currentSeason") || 1;
    const spellLevel = item.system?.level || 0;
    
    // 僅限原初施法者 + 處於狂夏(2) + 消耗法術位(環階>0)
    if (isPrimal && currentSeason === 2 && spellLevel > 0) {
        config._summerPulseApplied = true;
        
        // 取得 rolls 陣列
        const rolls = config.rolls;
        if (rolls && Array.isArray(rolls)) {
            rolls.forEach(roll => {
                if (roll.parts && Array.isArray(roll.parts)) {
                    roll.parts = roll.parts.map(part => {
                        if (typeof part === "string") {
                            // 將所有的 dX 替換為 dXrr1 (重擲1)，並防止重複添加 rr1
                            return part.replace(/d(\d+)(?!rr1)/gi, "d$1rr1");
                        }
                        return part;
                    });
                }
            });
            log(`狂夏脈衝觸發：已自動將傷害/治療公式加入 rr1 (重擲1) 機制。`, "info");
        }
    }
};

// 攔截 DnD5e 的傷害與治療擲骰生成階段 (相容 v3 與 v4/v5)
Hooks.on("dnd5e.preRollDamage", applySummerPulse);
Hooks.on("dnd5e.preRollDamageV2", applySummerPulse);
Hooks.on("dnd5e.preRollHealing", applySummerPulse);
Hooks.on("dnd5e.preRollHealingV2", applySummerPulse);

// ==========================================
// ⭐ 核心律動管理：死秋脈衝 Hook
// ==========================================

// 1. 死秋脈衝：前置傷害擲骰階段 (Prompt 傷害選擇)
Hooks.on("midi-qol.preDamageRoll", async (workflow) => {
    const actor = workflow.actor;
    const item = workflow.item;
    if (!actor || !item || item.type !== "spell") return;
    const isPrimal = isPrimalCaster(actor);
    const currentSeason = actor.getFlag("velkora-all-in-one", "currentSeason") || 1;
    const spellLevel = workflow.castData?.castLevel || workflow.spellLevel || item.system.level || 0;
    
    if (isPrimal && currentSeason === 3 && spellLevel > 0) {
        const types = Object.keys(CONFIG.DND5E?.damageTypes || {
            acid: "DND5E.DamageAcid",
            bludgeoning: "DND5E.DamageBludgeoning",
            cold: "DND5E.DamageCold",
            fire: "DND5E.DamageFire",
            force: "DND5E.DamageForce",
            lightning: "DND5E.DamageLightning",
            necrotic: "DND5E.DamageNecrotic",
            piercing: "DND5E.DamagePiercing",
            poison: "DND5E.DamagePoison",
            psychic: "DND5E.DamagePsychic",
            radiant: "DND5E.DamageRadiant",
            slashing: "DND5E.DamageSlashing",
            thunder: "DND5E.DamageThunder"
        });

        let typesHtml = "";
        for (const type of types) {
            const systemLabel = CONFIG.DND5E?.damageTypes?.[type]?.label || CONFIG.DND5E?.damageTypes?.[type] || type;
            const localizedLabel = game.i18n.localize(systemLabel);
            const englishLabel = type.charAt(0).toUpperCase() + type.slice(1);
            
            typesHtml += `
                <div class="autumn-card" data-type="${type}">
                    <div style="font-weight: bold;">${localizedLabel}</div>
                    <div style="font-size: 0.8em; color: #94a3b8;">${englishLabel}</div>
                </div>
            `;
        }

        let content = `
        <style>
        .autumn-grid {
            display: grid;
            grid-template-columns: repeat(3, 1fr);
            gap: 8px;
            margin-bottom: 12px;
        }
        .autumn-card {
            background: #1e293b;
            border: 1px solid #475569;
            border-radius: 6px;
            padding: 8px;
            text-align: center;
            color: #e2e8f0;
            cursor: pointer;
            transition: all 0.2s ease;
        }
        .autumn-card:hover {
            background: #334155;
            border-color: #fbbf24;
            box-shadow: 0 0 8px rgba(251, 191, 36, 0.4);
        }
        .autumn-card.selected {
            background: #78350f;
            border-color: #fbbf24;
            color: #fbbf24;
            box-shadow: 0 0 12px rgba(251, 191, 36, 0.6);
        }
        </style>
        <p style="margin-bottom: 10px;">${game.i18n.localize("VELKORA.Rhythm.Autumn.pulse")}</p>
        <div class="autumn-grid">
            ${typesHtml}
        </div>
        <input type="hidden" id="selected-damage-type" value="">
        `;
        
        const chosenType = await new Promise((resolve) => {
            new Dialog({
                title: game.i18n.localize("VELKORA.Dialog.Autumn.Title"),
                content: content,
                buttons: {
                    confirm: {
                        icon: '<i class="fas fa-check"></i>',
                        label: game.i18n.localize("VELKORA.Dialog.Autumn.Confirm"),
                        callback: (html) => {
                            const htmlEl = html instanceof HTMLElement ? html : html[0];
                            const val = htmlEl.querySelector("#selected-damage-type")?.value;
                            if (!val) {
                                ui.notifications.warn(game.i18n.localize("VELKORA.Notifications.SelectResistance"));
                                return false;
                            }
                            resolve(val);
                        }
                    }
                },
                default: "confirm",
                render: (html) => {
                    const htmlEl = html instanceof HTMLElement ? html : html[0];
                    htmlEl.querySelectorAll(".autumn-card").forEach(card => {
                        card.addEventListener("click", function() {
                            htmlEl.querySelectorAll(".autumn-card").forEach(c => c.classList.remove("selected"));
                            this.classList.add("selected");
                            const type = this.dataset.type;
                            const input = htmlEl.querySelector("#selected-damage-type");
                            if (input) input.value = type;
                        });
                    });
                },
                close: () => {
                    resolve("");
                }
            }).render(true);
        });
        
        if (chosenType) {
            await actor.setFlag("velkora-all-in-one", "autumnIgnoredType", chosenType);
            workflow.autumnIgnoredType = chosenType;
            
            let chatMessage = null;
            if (workflow.chatMessage) chatMessage = workflow.chatMessage;
            else if (workflow.itemCardId) chatMessage = game.messages.get(workflow.itemCardId);
            else if (workflow.chatCard) {
                if (typeof workflow.chatCard.getFlag === "function") chatMessage = workflow.chatCard;
                else if (workflow.chatCard.id) chatMessage = game.messages.get(workflow.chatCard.id);
            }
            
            if (chatMessage) {
                await chatMessage.setFlag("velkora-all-in-one", "autumnIgnoredType", chosenType);
                log(`死秋脈衝：玩家選擇無視抗性類型為 ${chosenType}，已保存至 ChatMessage flag。`, "info");
            } else {
                log(`死秋脈衝：無法取得 ChatMessage，僅保存至 Actor/Workflow。`, "warning");
            }
            
            // 方案一：修改 cloned activity & item 的 midiProperties ignoreTraits，讓 Midi-QOL 原生計算直接無視抗性
            if (workflow.activity) {
                if (!workflow.activity.midiProperties) {
                    workflow.activity.midiProperties = {};
                }
                if (!(workflow.activity.midiProperties.ignoreTraits instanceof Set)) {
                    const existing = workflow.activity.midiProperties.ignoreTraits;
                    if (Array.isArray(existing)) {
                        workflow.activity.midiProperties.ignoreTraits = new Set(existing);
                    } else if (existing instanceof Set) {
                        // already a Set
                    } else {
                        workflow.activity.midiProperties.ignoreTraits = new Set();
                    }
                }
                workflow.activity.midiProperties.ignoreTraits.add(`idr.${chosenType}`);
                log(`死秋脈衝：已向 activity.midiProperties.ignoreTraits 添加 idr.${chosenType}`, "info");
            }

            if (workflow.item) {
                if (!workflow.item.system) workflow.item.system = {};
                if (!workflow.item.system.midiProperties) workflow.item.system.midiProperties = {};
                if (!(workflow.item.system.midiProperties.ignoreTraits instanceof Set)) {
                    const existing = workflow.item.system.midiProperties.ignoreTraits;
                    if (Array.isArray(existing)) {
                        workflow.item.system.midiProperties.ignoreTraits = new Set(existing);
                    } else if (existing instanceof Set) {
                        // already a Set
                    } else {
                        workflow.item.system.midiProperties.ignoreTraits = new Set();
                    }
                }
                workflow.item.system.midiProperties.ignoreTraits.add(`idr.${chosenType}`);
                log(`死秋脈衝：已向 item.system.midiProperties.ignoreTraits 添加 idr.${chosenType}`, "info");
            }
        } else {
            log(`死秋脈衝：使用者未選擇任何抗性，取消操作。`, "info");
        }
    }
});

// 2. 死秋脈衝：直接無視抗性修補傷害
Hooks.on("midi-qol.preTargetDamageApplication", (token, arg2, arg3) => {
    let damageItem, workflow;
    if (arg2 && arg2.damageItem) {
        damageItem = arg2.damageItem;
        workflow = arg2.workflow;
    } else {
        damageItem = arg2;
        workflow = arg3;
    }
    if (!workflow || !damageItem) return;

    const caster = workflow.actor;
    let chatMessage = null;
    if (workflow.chatMessage) chatMessage = workflow.chatMessage;
    else if (workflow.itemCardId) chatMessage = game.messages.get(workflow.itemCardId);
    else if (workflow.chatCard) {
        if (typeof workflow.chatCard.getFlag === "function") chatMessage = workflow.chatCard;
        else if (workflow.chatCard.id) chatMessage = game.messages.get(workflow.chatCard.id);
    }

    const ignoredType = chatMessage?.getFlag("velkora-all-in-one", "autumnIgnoredType") || workflow.autumnIgnoredType || caster?.getFlag("velkora-all-in-one", "autumnIgnoredType");
    if (!ignoredType) return;

    const targetActor = token.actor;
    if (!targetActor) return;
    
    const drValue = targetActor.system?.traits?.dr?.value;
    const diValue = targetActor.system?.traits?.di?.value;
    const hasDR = drValue instanceof Set ? drValue.has(ignoredType) : Array.isArray(drValue) ? drValue.includes(ignoredType) : false;
    const hasDI = diValue instanceof Set ? diValue.has(ignoredType) : Array.isArray(diValue) ? diValue.includes(ignoredType) : false;

    if (hasDR && !hasDI) {
        const getDamageOfType = (details, type) => {
            if (!details || !Array.isArray(details)) return 0;
            let total = 0;
            for (const d of details) {
                if (!d) continue;
                if (Array.isArray(d)) { if (d[1] === type) total += Number(d[0]) || 0; }
                else { const t = d.type || d.damageType; const v = d.damage ?? d.value ?? 0; if (t === type) total += Number(v) || 0; }
            }
            return total;
        };

        const rawVal = getDamageOfType(damageItem.rawDamageDetail, ignoredType);
        const calcVal = getDamageOfType(damageItem.damageDetail, ignoredType);

        // 計算豁免與閃避對原始傷害的乘數
        const isDexSave = workflow.savingThrow === "dex" || workflow.item?.system?.save?.ability === "dex";
        const hasEvasion = isDexSave && targetActor.items.some(i => i.name === "Evasion" || i.name === "閃避" || i.name === "躲避" || i.name === "精通閃避" || i.name === "反射閃避");
        const hasSaved = workflow.saves && (workflow.saves.has(token) || workflow.saves.has(token.document));
        
        let saveMult = 1.0;
        if (hasEvasion) {
            saveMult = hasSaved ? 0.0 : 0.5;
        } else if (hasSaved) {
            saveMult = workflow.saveMultiplier ?? 0.5;
        }

        const expectedVal = Math.floor(rawVal * saveMult);
        const diff = expectedVal - calcVal;

        if (diff > 0) {
            log(`死秋無視抗性（preTargetDamageApplication）：目標=${targetActor.name}, 原始傷害=${rawVal}, 豁免乘數=${saveMult}, 預期傷害=${expectedVal}, 目前計算傷=${calcVal}, 補回差值=${diff}`, "info");

            // 1. 修改 damageDetail 陣列中該類型的傷害值，以維持卡片顯示一致性
            for (const d of damageItem.damageDetail) {
                if (Array.isArray(d)) {
                    if (d[1] === ignoredType) {
                        d[0] = (Number(d[0]) || 0) + diff;
                    }
                } else if (d) {
                    const t = d.type || d.damageType;
                    if (t === ignoredType) {
                        if (d.damage !== undefined) d.damage += diff;
                        else if (d.value !== undefined) d.value += diff;
                    }
                }
            }

            // 2. 重新分配並計算 hpDamage, tempDamage, newHP, newTempHP
            const currentHp = damageItem.oldHP ?? 0;
            const currentTemp = damageItem.oldTempHP ?? 0;
            
            // 補回差值後的總傷害
            const totalDamage = (damageItem.hpDamage || 0) + (damageItem.tempDamage || 0) + diff;
            
            const tempAbsorb = Math.min(totalDamage, currentTemp);
            const hpPart = totalDamage - tempAbsorb;
            
            damageItem.tempDamage = tempAbsorb;
            damageItem.hpDamage = hpPart;
            damageItem.newTempHP = Math.max(0, currentTemp - tempAbsorb);
            damageItem.newHP = Math.max(0, currentHp - hpPart);
            
            if (damageItem.appliedDamage !== undefined) {
                damageItem.appliedDamage = (damageItem.appliedDamage || 0) + diff;
            }

            log(`死秋已修正 damageItem：hpDamage=${damageItem.hpDamage}, tempDamage=${damageItem.tempDamage}, newHP=${damageItem.newHP}, newTempHP=${damageItem.newTempHP}`, "info");
        }
    }
});

// ==========================================
// ⭐ 玩家端面板：原初施法者 四季律動 HUD
// ==========================================
class PrimalRhythmHUD extends Application {
    constructor(actor, options) {
        super(options);
        this.actor = actor;
    }

    static get defaultOptions() {
        return foundry.utils.mergeObject(super.defaultOptions, {
            title: `🌿 ${game.i18n.localize("VELKORA.HUD.PrimalRhythmTitle")}`,
            width: 320,
            height: "auto",
            classes: ["dialog"],
            resizable: true
        });
    }

    get id() {
        return `primal-rhythm-hud-${this.actor.id}`; 
    }

    async _renderInner(data) {
        let seasonIdx = this.actor.getFlag("velkora-all-in-one", "currentSeason") || 1;
        const rhythmTable = (CONFIG.Velkora && CONFIG.Velkora.PRIMAL_RHYTHM) ? CONFIG.Velkora.PRIMAL_RHYTHM : null;
        if (!rhythmTable) return $(`<div style="color:red; padding:10px;">${game.i18n.localize("VELKORA.HUD.NoTable") || "無法讀取四季律動表"}</div>`)[0];

        const currentSeason = rhythmTable[seasonIdx];
        const colors = { 1: { text: "#4ade80", bg: "#064e3b" }, 2: { text: "#f87171", bg: "#7f1d1d" }, 3: { text: "#fbbf24", bg: "#78350f" }, 4: { text: "#60a5fa", bg: "#1e3a8a" } };
        const c = colors[seasonIdx];

        const localizedSeasonName = game.i18n.localize(currentSeason.name);
        const springText = game.i18n.localize("VELKORA.Rhythm.Spring.name").split(" ")[0];
        const summerText = game.i18n.localize("VELKORA.Rhythm.Summer.name").split(" ")[0];
        const autumnText = game.i18n.localize("VELKORA.Rhythm.Autumn.name").split(" ")[0];
        const winterText = game.i18n.localize("VELKORA.Rhythm.Winter.name").split(" ")[0];

        const htmlString = `
            <div style="background: #111827; color: white; padding: 10px; border-radius: 5px;">
                <h2 style="text-align:center; color: ${c.text}; border-bottom: none; font-weight: bold;">${localizedSeasonName}</h2>
                <div style="display: flex; gap: 4px; margin-bottom: 15px;">
                    <button class="season-btn" data-season="1">${springText}</button>
                    <button class="season-btn" data-season="2">${summerText}</button>
                    <button class="season-btn" data-season="3">${autumnText}</button>
                    <button class="season-btn" data-season="4">${winterText}</button>
                </div>
            </div>
        `;
        const div = document.createElement("div");
        div.innerHTML = htmlString;
        return $(div.firstElementChild);
    }

    activateListeners(html) {
        super.activateListeners(html);
        html[0].querySelectorAll('.season-btn').forEach(btn => {
            btn.addEventListener('click', async (ev) => {
                const newSeason = parseInt(ev.currentTarget.dataset.season, 10);
                await setActorSeason(this.actor, newSeason, "手動覆蓋");
            });
        });
    }
}

// ==========================================
// 🛠️ 危殼專屬特性點擊自訂執行器 (輔助函數，避免 Midi-QOL 工作流污染目標)
// ==========================================
function handleRotationUse(actor) {
    if (!game.combat) {
        ui.notifications.warn(game.i18n.localize("VELKORA.Notifications.OnlyInCombat"));
        log(`玩家嘗試在非戰鬥狀態使用「主動輪轉」特質，已被拒絕。`, "info");
        return;
    }

    let current = actor.getFlag("velkora-all-in-one", "currentSeason") || 1;
    let next = current + 1;
    if (next > 4) next = 1;

    log(`玩家使用「主動輪轉」特質，自動單向輪換季節：${current} ➜ ${next}`, "info");
    setActorSeason(actor, next, "主動輪換");
}

function handleOverloadUse(actor) {
    const actorName = actor.name || "未知角色";
    const titleText = game.i18n.format("VELKORA.Dialog.Overload.Title", { name: actorName });
    const contentText = game.i18n.localize("VELKORA.Dialog.Overload.Content");
    const elevationText = game.i18n.localize("VELKORA.Dialog.Overload.Elevation");
    const penetrationText = game.i18n.localize("VELKORA.Dialog.Overload.Penetration");
    const destructionText = game.i18n.localize("VELKORA.Dialog.Overload.Destruction");
    const confirmText = game.i18n.localize("VELKORA.Dialog.Overload.Confirm");

    new Dialog({
        title: titleText,
        content: `
            <div style="margin-bottom: 10px;">
                <p>${contentText}</p>
                <select id="overload-choice" style="width: 100%; height: 30px;">
                    <option value="Elevation">${elevationText}</option>
                    <option value="Penetration">${penetrationText}</option>
                    <option value="Destruction">${destructionText}</option>
                </select>
            </div>
        `,
        buttons: {
            confirm: {
                icon: '<i class="fas fa-fire"></i>',
                label: confirmText,
                callback: async (html) => {
                    const htmlEl = html instanceof HTMLElement ? html : html[0];
                    const choiceNode = htmlEl.querySelector("#overload-choice");
                    const choice = choiceNode ? choiceNode.value : "Elevation";
                    
                    const choiceLabel = game.i18n.localize(`VELKORA.Dialog.Overload.${choice}`).split(" (")[0];

                    const effectData = {
                        name: game.i18n.format("VELKORA.Chat.OverloadBuffName", { choice: choiceLabel }),
                        img: "modules/velkora-all-in-one/assets/icons/overload.svg",
                        description: game.i18n.format("VELKORA.Chat.OverloadBuffDesc", { choice: choiceLabel }),
                        flags: { "velkora-all-in-one": { isOverloadBuff: true, overloadType: choice } },
                        changes: []
                    };

                    if (choice === "Destruction") {
                        effectData.changes.push({ key: "flags.midi-qol.max.damage.all", mode: 5, value: "1" });
                    } else if (choice === "Penetration") {
                        effectData.changes.push({ key: "flags.midi-qol.advantage.attack.all", mode: 5, value: "1" });
                        effectData.changes.push({ key: "flags.midi-qol.grants.disadvantage.save.all", mode: 5, value: "1" });
                    }

                    await actor.createEmbeddedDocuments("ActiveEffect", [effectData]);

                    ChatMessage.create({
                        speaker: ChatMessage.getSpeaker({actor: actor}),
                        content: `<div style="background: rgba(255,0,0,0.1); padding: 5px; border-left: 4px solid darkred;">
                                    <h3 style="color: darkred; margin:0;">${game.i18n.localize("VELKORA.Chat.OverloadTitle")}</h3>
                                    <p style="margin: 5px 0 0 0;">${game.i18n.format("VELKORA.Chat.OverloadBody", { choice: choiceLabel })}</p>
                                  </div>`
                    });
                }
            }
        },
        default: "confirm"
    }).render(true);
}

function handleSutureUse(actor) {
    const actorName = actor.name || "未知角色";
    const spells = actor.system.spells || {};
    let slotOptions = "";
    
    for (let i = 1; i <= 9; i++) {
        if (spells[`spell${i}`] && spells[`spell${i}`].max > 0 && spells[`spell${i}`].value > 0) {
            slotOptions += `<option value="${i}">${game.i18n.format("VELKORA.Dialog.Suture.SpellSlot", { level: i, value: spells[`spell${i}`].value })}</option>`;
        }
    }
    if (spells.pact && spells.pact.max > 0 && spells.pact.value > 0) {
        slotOptions += `<option value="${spells.pact.level}">${game.i18n.format("VELKORA.Dialog.Suture.PactSlot", { level: spells.pact.level, value: spells.pact.value })}</option>`;
    }

    if (slotOptions === "") {
        ui.notifications.warn(game.i18n.localize("VELKORA.Notifications.NoSutureSlots"));
        return;
    }

    const dialogTitle = game.i18n.format("VELKORA.Dialog.Suture.Title", { name: actorName });
    const dialogContent = game.i18n.localize("VELKORA.Dialog.Suture.Content");
    const selectSlotLabel = game.i18n.localize("VELKORA.Dialog.Suture.SelectSlot");
    const executeLabel = game.i18n.localize("VELKORA.Dialog.Suture.Execute");
    const cancelLabel = game.i18n.localize("VELKORA.HUD.Cancel");

    new Dialog({
        title: dialogTitle,
        content: `
            <div style="margin-bottom: 10px;">
                <p>${dialogContent}</p>
                <label>${selectSlotLabel}</label>
                <select id="suture-slot-level" style="width: 100%; height: 30px;">
                    ${slotOptions}
                </select>
            </div>
        `,
        buttons: {
            confirm: {
                icon: '<i class="fas fa-check"></i>',
                label: executeLabel,
                callback: async (html) => {
                    const htmlEl = html instanceof HTMLElement ? html : html[0];
                    const selectNode = htmlEl.querySelector("#suture-slot-level");
                    const chosenLevel = parseInt(selectNode.value, 10);
                    const isPact = selectNode.options[selectNode.selectedIndex].text.includes(game.i18n.localize("VELKORA.Dialog.Suture.PactSlot").split(" {")[0]);
                    
                    if (isPact) {
                        await actor.update({ "system.spells.pact.value": spells.pact.value - 1 });
                    } else {
                        await actor.update({ [`system.spells.spell${chosenLevel}.value`]: spells[`spell${chosenLevel}`].value - 1 });
                    }

                    if (game.user.isGM) {
                        await applySutureExecution(actor, actor.name, chosenLevel);
                    } else {
                        const activeGM = game.users.find(u => u.isGM && u.active);
                        if (activeGM) {
                            log(`[Socket] 發送屏障縫合信號至 GM: level=${chosenLevel}`, "info");
                            game.socket.emit("module.velkora-all-in-one", {
                                action: "suture",
                                level: chosenLevel,
                                actorId: actor.id
                            });
                        } else {
                            ui.notifications.warn(game.i18n.localize("VELKORA.Notifications.NoActiveGmSuture"));
                        }
                    }
                }
            },
            cancel: { icon: '<i class="fas fa-times"></i>', label: cancelLabel }
        },
        default: "confirm"
    }).render(true);
}

// ==========================================
// ⭐ 核心過載管理：施法升階 (preUseActivity 攔截)
// ==========================================
Hooks.on("dnd5e.preUseActivity", (activity, usageConfig, dialogConfig, messageConfig) => {
    const actor = activity.actor;
    if (!actor) return;
    const item = activity.item;
    if (!item) return;

    const isOverloadItem = item.flags?.["velkora-all-in-one"]?.isOverload || item.name === "過載施法" || item.name === "过载施法" || item.name === "Overload Casting";
    const isSuture = item.flags?.["velkora-all-in-one"]?.isSuture || item.name === "屏障縫合" || item.name === "屏障缝合" || item.name === "Veil Suture" || item.name === "Barrier Suture";
    const isRotation = item.flags?.["velkora-all-in-one"]?.isRotation || 
                       item.name === "主動輪轉" || item.name.startsWith("主動輪轉") ||
                       item.name === "主动轮转" || item.name.startsWith("主动轮转") ||
                       item.name === "Active Rotation" || item.name.startsWith("Active Rotation");

    const lockObj = game.actors.get(actor.id) || actor;

    if (isOverloadItem) {
        if (lockObj._velkoraUsingOverload) return false;
        lockObj._velkoraUsingOverload = true;
        setTimeout(() => delete lockObj._velkoraUsingOverload, 500);
        handleOverloadUse(actor);
        return false;
    }
    if (isSuture) {
        if (lockObj._velkoraUsingSuture) return false;
        lockObj._velkoraUsingSuture = true;
        setTimeout(() => delete lockObj._velkoraUsingSuture, 500);
        handleSutureUse(actor);
        return false;
    }
    if (isRotation) {
        if (lockObj._velkoraUsingRotation) return false;
        lockObj._velkoraUsingRotation = true;
        setTimeout(() => delete lockObj._velkoraUsingRotation, 500);
        handleRotationUse(actor);
        return false;
    }

    // 檢查是否有過載升階 buff (使用 getFlag 確保相容性)
    const overloadEffect = actor.effects.find(e => e.getFlag?.("velkora-all-in-one", "isOverloadBuff") && e.getFlag?.("velkora-all-in-one", "overloadType") === "Elevation");
    if (!overloadEffect) return;

    // 過載升階僅限於大於 0 環的法術 (排除戲法)
    if (activity.item?.type !== "spell" || activity.item?.system?.level === 0) return;

    log(`檢測到 ${actor.name} 宣告過載施法：法術升階，動態注入 scaling 邏輯。`, "info");

    // 備份原有的 _prepareUsageScaling 方法
    const originalPrepare = activity._prepareUsageScaling;

    // 覆蓋 _prepareUsageScaling 方法
    activity._prepareUsageScaling = async function(uConfig, mConfig, itemClone) {
        let originalLevel = 0;
        const slot = uConfig.spell?.slot;
        
        // 取得所選法術位/契術位的原始環階
        if (slot === "pact") {
            originalLevel = this.actor.system.spells?.pact?.level || 0;
        } else if (slot && slot.startsWith("spell")) {
            originalLevel = parseInt(slot.replace("spell", "")) || 0;
        } else {
            // 預設/備用
            originalLevel = itemClone.system.level || 0;
        }

        // 計算過載升階目標環階：
        // 9環 -> 不變； 8環 -> 9環 (+1)； 1-7環 -> +2 環
        let targetLevel = originalLevel;
        if (originalLevel === 8) {
            targetLevel = 9;
        } else if (originalLevel <= 7 && originalLevel > 0) {
            targetLevel = originalLevel + 2;
        }

        log(`[過載升階] 原始消耗環階=${originalLevel}，升階後威力=${targetLevel}，法術基礎環階=${itemClone.system.level}`, "info");

        // 儲存原始環階於 Actor 的 Flag 中，便於 RollComplete 壓力結算 (同時存於 Synthetic 和 Base Actor 避免 mismatch)
        await this.actor.setFlag("velkora-all-in-one", "overloadOriginalLevel", originalLevel);
        const baseActor = game.actors.get(this.actor.id);
        if (baseActor && baseActor !== this.actor) {
            await baseActor.setFlag("velkora-all-in-one", "overloadOriginalLevel", originalLevel);
        }

        // 先執行原生的 _prepareUsageScaling 邏輯
        if (typeof originalPrepare === "function") {
            await originalPrepare.call(this, uConfig, mConfig, itemClone);
        }

        // 強制覆蓋為過載升階後的值
        uConfig.scaling = Math.max(0, targetLevel - itemClone.system.level);
        foundry.utils.setProperty(mConfig, "data.system.spellLevel", targetLevel);
        foundry.utils.setProperty(mConfig, "data.system.scaling", uConfig.scaling);
    };
});

// ==========================================
// ⭐ 核心過載管理：Midi-QOL 攔截以防止目標被強制轉向玩家自己
// ==========================================
Hooks.on("midi-qol.preTargeting", (workflow) => {
    const actor = workflow.actor;
    const item = workflow.item;
    if (!actor || !item) return;

    const isOverloadItem = item.flags?.["velkora-all-in-one"]?.isOverload || item.name === "過載施法" || item.name === "过载施法" || item.name === "Overload Casting";
    const isSuture = item.flags?.["velkora-all-in-one"]?.isSuture || item.name === "屏障縫合" || item.name === "屏障缝合" || item.name === "Veil Suture" || item.name === "Barrier Suture";
    const isRotation = item.flags?.["velkora-all-in-one"]?.isRotation || 
                       item.name === "主動輪轉" || item.name.startsWith("主動輪轉") ||
                       item.name === "主动轮转" || item.name.startsWith("主动轮转") ||
                       item.name === "Active Rotation" || item.name.startsWith("Active Rotation");

    const lockObj = game.actors.get(actor.id) || actor;

    if (isOverloadItem) {
        if (lockObj._velkoraUsingOverload) return false;
        lockObj._velkoraUsingOverload = true;
        setTimeout(() => delete lockObj._velkoraUsingOverload, 500);
        handleOverloadUse(actor);
        return false;
    }
    if (isSuture) {
        if (lockObj._velkoraUsingSuture) return false;
        lockObj._velkoraUsingSuture = true;
        setTimeout(() => delete lockObj._velkoraUsingSuture, 500);
        handleSutureUse(actor);
        return false;
    }
    if (isRotation) {
        if (lockObj._velkoraUsingRotation) return false;
        lockObj._velkoraUsingRotation = true;
        setTimeout(() => delete lockObj._velkoraUsingRotation, 500);
        handleRotationUse(actor);
        return false;
    }
});

// ==========================================
// ⭐ 核心過載管理：Midi-QOL 施法升階等級修正
// ==========================================
Hooks.on("midi-qol.preItemRoll", async (workflow) => {
    const actor = workflow.actor;
    const item = workflow.item;
    if (!actor || !item || item.type !== "spell") return;

    // 檢查是否有過載升階 buff (使用 getFlag)
    const overloadEffect = actor.effects.find(e => e.getFlag?.("velkora-all-in-one", "isOverloadBuff") && e.getFlag?.("velkora-all-in-one", "overloadType") === "Elevation");
    if (!overloadEffect) return;

    // 排除戲法
    if (item.system?.level === 0) return;

    const originalLevel = workflow.spellLevel;
    let targetLevel = originalLevel;
    if (originalLevel === 8) {
        targetLevel = 9;
    } else if (originalLevel <= 7 && originalLevel > 0) {
        targetLevel = originalLevel + 2;
    }

    log(`[Midi PreItemRoll] Overload Elevation: originalLevel=${originalLevel} -> targetLevel=${targetLevel}`, "info");

    workflow.spellLevel = targetLevel;
    if (workflow.castData) {
        workflow.castData.castLevel = targetLevel;
    }
});

// ==========================================
// ⭐ 核心結算引擎：RollComplete
// ==========================================
Hooks.on("midi-qol.RollComplete", async (workflow) => {
    const rollingUser = workflow.user || game.users.get(workflow.userId);
    if (rollingUser && rollingUser.id !== game.user.id) return;

    const actor = workflow.actor;
    const item = workflow.item;
    if (!actor || !item) return;

    if (item.type === "spell") {
        const isPrimal = isPrimalCaster(actor);
        let baseSpellLevel = workflow.spellLevel || workflow.castData?.castLevel || workflow.itemLevel || item.system?.level || 0;

        if (isPrimal && baseSpellLevel > 0) {
            if (!game.combat) {
                log(`不在戰鬥狀態下，施法不觸發季節脈衝或輪轉：角色=${actor.name}, 法術=${item.name}`, "info");
                return;
            }
            let currentSeason = actor.getFlag("velkora-all-in-one", "currentSeason") || 1;
            const rhythmTable = CONFIG.Velkora?.PRIMAL_RHYTHM;

            if (rhythmTable) {
                let pulseMsg = "";
                let pulseBg = "rgba(22, 163, 74, 0.08)";
                let pulseBorder = "#16a34a";
                let pulseTitleColor = "#16a34a";
                
                if (currentSeason === 1) {
                    const tempHpGain = baseSpellLevel * 2;
                    let currentTempHp = actor.system.attributes?.hp?.temp || 0;
                    if (tempHpGain > currentTempHp) {
                        await actor.update({ "system.attributes.hp.temp": tempHpGain });
                    }
                    pulseMsg = game.i18n.format("VELKORA.Chat.PulseSpring", { name: actor.name, temp: tempHpGain });
                    pulseBg = "rgba(22, 163, 74, 0.08)";
                    pulseBorder = "#16a34a";
                    pulseTitleColor = "#16a34a";
                } else if (currentSeason === 2) {
                    pulseMsg = game.i18n.localize("VELKORA.Chat.PulseSummer");
                    pulseBg = "rgba(220, 38, 38, 0.08)";
                    pulseBorder = "#dc2626";
                    pulseTitleColor = "#dc2626";
                } else if (currentSeason === 3) {
                    let chatMessage = null;
                    if (workflow.chatMessage) chatMessage = workflow.chatMessage;
                    else if (workflow.itemCardId) chatMessage = game.messages.get(workflow.itemCardId);
                    else if (workflow.chatCard) {
                        if (typeof workflow.chatCard.getFlag === "function") chatMessage = workflow.chatCard;
                        else if (workflow.chatCard.id) chatMessage = game.messages.get(workflow.chatCard.id);
                    }
                    const ignoredType = chatMessage?.getFlag("velkora-all-in-one", "autumnIgnoredType") || workflow.autumnIgnoredType || actor.getFlag("velkora-all-in-one", "autumnIgnoredType");

                    if (ignoredType) {
                        const systemLabel = CONFIG.DND5E?.damageTypes?.[ignoredType]?.label || ignoredType;
                        const localizedLabel = game.i18n.localize(systemLabel);
                        const typeLabel = `${localizedLabel} (${ignoredType.charAt(0).toUpperCase() + ignoredType.slice(1)})`;
                        pulseMsg = game.i18n.format("VELKORA.Chat.PulseAutumn", { type: typeLabel });
                    } else {
                        pulseMsg = game.i18n.localize("VELKORA.Chat.PulseAutumnNone");
                    }
                    pulseBg = "rgba(217, 119, 6, 0.08)";
                    pulseBorder = "#d97706";
                    pulseTitleColor = "#d97706";
                } else if (currentSeason === 4) {
                    pulseMsg = game.i18n.localize("VELKORA.Chat.PulseWinter");
                    pulseBg = "rgba(37, 99, 235, 0.08)";
                    pulseBorder = "#2563eb";
                    pulseTitleColor = "#2563eb";
                    
                    // 生成冰霜區域 MeasuredTemplate 模板
                    const token = workflow.token || canvas.tokens.placeables.find(t => t.actor?.id === actor.id);
                    if (token) {
                        const templateData = {
                            t: "circle",
                            user: game.user.id,
                            x: token.center.x,
                            y: token.center.y,
                            distance: 10,
                            direction: 0,
                            angle: 360,
                            fillColor: "#93c5fd",
                            flags: {
                                "velkora-all-in-one": {
                                    isWinterZone: true,
                                    spellDc: actor.system?.attributes?.spell?.dc || actor.system?.attributes?.spelldc || 10,
                                    casterCombatantId: game.combat?.combatants.find(c => c.actor?.id === actor.id)?.id || null,
                                    casterActorId: actor.id,
                                    remainingTurns: 2,
                                    createdAt: game.time.worldTime
                                }
                            }
                        };
                        
                        try {
                            const [doc] = await canvas.scene.createEmbeddedDocuments("MeasuredTemplate", [templateData]);
                            if (doc) {
                                log(`已成功生成凜冬冰霜區域模板。`, "info");
                                
                                // 非戰鬥中：12秒後自動刪除
                                if (!game.combat) {
                                    setTimeout(async () => {
                                        try {
                                            const t = canvas.scene.templates.get(doc.id);
                                            if (t) {
                                                await t.delete();
                                                log(`非戰鬥狀態，12秒時間已到，已刪除凜冬冰霜區域模板。`, "info");
                                            }
                                        } catch (e) {
                                            log(`自動刪除凜冬冰霜區域模板時出錯：${e.message}`, "warn");
                                        }
                                    }, 12000);
                                }
                            }
                        } catch (e) {
                            log(`生成凜冬冰霜區域模板時出錯：${e.message}`, "error");
                        }
                    }
                }

                const seasonalPulseTitle = game.i18n.format("VELKORA.Chat.PulseTitle", { name: rhythmTable[currentSeason]?.name ? game.i18n.localize(rhythmTable[currentSeason].name) : "" });

                // 發送第一張卡：脈衝效果結算
                ChatMessage.create({
                    speaker: ChatMessage.getSpeaker({ actor: actor }),
                    content: `
                        <div style="background: ${pulseBg}; padding: 8px; border-left: 4px solid ${pulseBorder}; border-radius: 3px;">
                            <h3 style="color: ${pulseTitleColor}; margin:0 0 4px 0; font-weight: bold;">${seasonalPulseTitle}</h3>
                            ${pulseMsg}
                        </div>
                    `
                });

                // 延遲清理可能存在的死秋 flag，避免與 GM 端的 preTargetDamageApplication 發生競爭
                setTimeout(async () => {
                    try {
                        const currentFlag = actor.getFlag("velkora-all-in-one", "autumnIgnoredType");
                        if (currentFlag) {
                            await actor.unsetFlag("velkora-all-in-one", "autumnIgnoredType");
                            log(`死秋脈衝：已清理 Actor ${actor.name} 的無視抗性 Flag。`, "info");
                        }
                    } catch (e) {
                        // 避免非同步調用報錯
                    }
                }, 2000);

                // 自動輪轉到下一個季節
                let nextSeason = currentSeason >= 4 ? 1 : currentSeason + 1;
                await setActorSeason(actor, nextSeason, "施法共鳴");
            }
        } else {
            // 奧術/神術施法者處理壓力結算
            const overloadEffect = actor.effects.find(e => e.getFlag?.("velkora-all-in-one", "isOverloadBuff"));
            const isOverloaded = !!overloadEffect;
            let overloadType = "";
            
            if (isOverloaded) overloadType = overloadEffect.getFlag("velkora-all-in-one", "overloadType");

            // 嘗試從當前 Actor、Token Actor 或 Base Actor 讀取旗標
            const overloadOriginalLevel = actor.getFlag("velkora-all-in-one", "overloadOriginalLevel") || 
                                          (actor.token ? actor.token.actor.getFlag("velkora-all-in-one", "overloadOriginalLevel") : undefined) ||
                                          (actor.uuid ? fromUuidSync(actor.uuid)?.getFlag("velkora-all-in-one", "overloadOriginalLevel") : undefined);

            const originalLevel = (overloadType === "Elevation" && overloadOriginalLevel !== undefined) ? overloadOriginalLevel : baseSpellLevel;

            // 壓力結算環階：升階（Elevation）時應使用升階後的環階 (baseSpellLevel)；其他情況使用 originalLevel
            const stressLevel = baseSpellLevel;

            if (stressLevel > 0) {
                const finalStress = stressLevel * (isOverloaded ? 2 : 1);
                
                let actionText = "";
                if (isOverloaded) {
                    const choiceLabel = game.i18n.localize(`VELKORA.Dialog.Overload.${overloadType}`).split(" (")[0];
                    const levelInfo = game.i18n.format("VELKORA.HUD.OverloadLevelInfo", { to: baseSpellLevel, from: originalLevel }) || `威力升至 ${baseSpellLevel} 環，原 ${originalLevel} 環`;
                    actionText = `${game.i18n.localize("VELKORA.HUD.OverloadCasting")}[${choiceLabel}]：${item.name} (${levelInfo})`;
                } else {
                    const castLabel = game.i18n.localize("VELKORA.HUD.CastSpell") || "施放";
                    const suffix = game.i18n.localize("VELKORA.HUD.SpellLevelSuffix") || "環";
                    actionText = `${castLabel}：${item.name} (${baseSpellLevel}${suffix})`;
                }

                if (game.user.isGM) {
                    await processStress(finalStress, finalStress, actor.name, actionText);
                } else {
                    const activeGM = game.users.find(u => u.isGM && u.active);
                    if (activeGM) {
                        log(`[Socket] 發送壓力調整信號至 GM: amount=${finalStress}`, "info");
                        game.socket.emit("module.velkora-all-in-one", {
                            action: "stress",
                            amount: finalStress,
                            effectiveSpellLevel: finalStress,
                            actorName: actor.name,
                            actionName: actionText,
                            actorId: actor.id
                        });
                    } else {
                        ui.notifications.warn(game.i18n.localize("VELKORA.Notifications.NoActiveGm"));
                    }
                }
            }

            // 清理 Flag
            if (overloadOriginalLevel !== undefined) {
                await actor.unsetFlag("velkora-all-in-one", "overloadOriginalLevel");
                const baseActor = game.actors.get(actor.id);
                if (baseActor && baseActor !== actor) {
                    await baseActor.unsetFlag("velkora-all-in-one", "overloadOriginalLevel");
                }
                log(`已自動清除暫存的過載原始環階旗標。`, "info");
            }

            if (isOverloaded) {
                try {
                    await overloadEffect.delete();
                } catch (e) {
                    // Silently ignore if already deleted
                }
                log(`已自動清除 ${actor.name} 的過載 Buff。`, "info");
            }
        }
    }
});

// ==========================================
// ⭐ 血肉代價與縫合執行函數 (GM 專用後台處理)
// ==========================================
async function applySutureExecution(actor, actorName, spellLevel) {
    const damageRoll = new Roll(`${spellLevel}d6`);
    await damageRoll.evaluate();
    const damage = damageRoll.total;
    
    let tempHp = actor.system.attributes?.hp?.temp || 0;
    let hp = actor.system.attributes?.hp?.value || 0;
    
    let remainingDamage = damage;
    let tempHpLoss = 0;
    let hpLoss = 0;

    if (tempHp > 0) {
        if (tempHp >= remainingDamage) {
            tempHpLoss = remainingDamage;
            tempHp -= remainingDamage;
            remainingDamage = 0;
        } else {
            tempHpLoss = tempHp;
            remainingDamage -= tempHp;
            tempHp = 0;
        }
    }
    
    hpLoss = remainingDamage;
    let newHp = hp - remainingDamage;
    log(`執行屏障縫合：角色=${actorName}, 消耗環階=${spellLevel}, 造成傷害=${damage}, 扣減生命=${hpLoss}, 扣減臨時生命=${tempHpLoss}`, "info");
    let isUnconscious = false;
    let updates = { "system.attributes.hp.temp": tempHp };
    
    if (newHp <= 0) {
        newHp = 0;
        isUnconscious = true;
        updates["system.attributes.death.success"] = 0;
        updates["system.attributes.death.failure"] = 0;
    }
    updates["system.attributes.hp.value"] = newHp;
    await actor.update(updates);
    
    let exhaustMsg = "";
    if (isUnconscious) {
        if (typeof actor.toggleStatusEffect === "function") {
            const hasUnconscious = actor.hasCondition ? actor.hasCondition("unconscious") : false;
            if (!hasUnconscious) await actor.toggleStatusEffect("unconscious", {active: true});
        }
        
        const currentEx = actor.system.attributes?.exhaustion ?? 0;
        await actor.update({"system.attributes.exhaustion": currentEx + 1});
        log(`角色 HP 歸 0，自動增加 1 層力竭。當前力竭等級：${currentEx + 1}`, "info");
        
        exhaustMsg = `<p style="color:#b91c1c; font-weight:bold; margin-top:6px; font-size:1.05em;">${game.i18n.localize("VELKORA.Notifications.SutureExhaustion")}</p>`;
    }

    const soulRendTitle = game.i18n.localize("VELKORA.Chat.SutureTitle") || "🩸 靈魂撕裂";
    const soulRendBody = game.i18n.format("VELKORA.Chat.SutureBody", { level: spellLevel, damage: damage, name: actorName });

    ChatMessage.create({
        speaker: ChatMessage.getSpeaker({actor: actor}),
        content: `<div style="background: rgba(168, 85, 247, 0.08); padding: 8px; border-left: 4px solid #a855f7; border-radius: 3px;">
                    <h3 style="color: #6b21a8; margin:0 0 4px 0; font-weight: bold;">${soulRendTitle}</h3>
                    <p style="margin: 0;">${soulRendBody}</p>
                    ${exhaustMsg}
                  </div>`
    });

    const reduceAmount = spellLevel * 2;
    const sutureLogTitle = game.i18n.format("VELKORA.Chat.SutureLogTitle", { level: spellLevel });
    await processStress(-reduceAmount, 0, actorName, sutureLogTitle, actor, { hp: hpLoss, temp: tempHpLoss }, damage);
}

// ==========================================
// ⭐ 玩家端與系統通訊：處理宣告與縫合對話框
// ==========================================
// ==========================================
// ⭐ 玩家端與系統通訊：宣告與縫合工作流已遷移至 dnd5e.preUseActivity 處理
// ==========================================


// ==========================================
// ⭐ 核心壓力結算與內聯撤銷引擎
// ==========================================
async function processStress(amount, effectiveSpellLevel, actorName = "系統", actionName = "調整", actor = null, hpLossData = null, sutureDamage = 0) {
    let currentStress = game.settings.get("velkora-all-in-one", "stressValue");
    if (isNaN(currentStress) || currentStress === null) {
        currentStress = 0;
    }
    amount = Number(amount) || 0;

    const currentState = {
        stress: currentStress,
        scab: game.settings.get("velkora-all-in-one", "scabCount"),
        logs: [...game.settings.get("velkora-all-in-one", "hudLogs")] 
    };
    await game.settings.set("velkora-all-in-one", "undoState", currentState);

    const baseThreshold = game.settings.get("velkora-all-in-one", "baseThreshold");
    const envModifier = game.settings.get("velkora-all-in-one", "envModifier");
    const scabCount = currentState.scab;
    
    const currentThreshold = baseThreshold + envModifier - (scabCount * 3);
    const halfThreshold = currentThreshold / 2;
    
    const newValue = Math.max(0, currentStress + amount);
    const actualChange = newValue - currentStress;
    log(`計算壓力變動：來源/角色=${actorName}, 變動量=${amount}, 原始值=${currentStress}, 新值=${newValue}, 結痂數=${scabCount}, 當前閾值=${currentThreshold}`, "info");

    const sign = actualChange > 0 ? "+" : "";
    const color = actualChange > 0 ? "#ff6b6b" : "#4ade80"; 
    
    if (actualChange === 0 && !hpLossData) return; 

    let scabIncrease = 0;
    let logExtraHtml = "";

    if (newValue >= currentThreshold && actualChange > 0) {
        scabIncrease = 1;
        log(`壓力達到或超過閾值，觸發屏障破裂！`, "warn");
        const anomalyRoll = new Roll(`1d20 + ${effectiveSpellLevel} + ${scabCount}`);
        await anomalyRoll.evaluate();
        const d6Roll = new Roll(`1d6`);
        await d6Roll.evaluate();

        const total = anomalyRoll.total;
        let severityLevel = "light", txtColor = "#fcd34d";
        if (total >= 15 && total <= 22) { severityLevel = "moderate"; txtColor = "#fb923c"; }
        else if (total >= 23) { severityLevel = "severe"; txtColor = "#ef4444"; }

        const severityLabel = game.i18n.localize(`VELKORA.Anomalies.Breach.${severityLevel}.label`);

        let disasterDescription = game.i18n.localize("VELKORA.Anomalies.Breach.Unknown") || "未知的災難席捲而來。";
        if (CONFIG.Velkora && CONFIG.Velkora.ANOMALY_TABLES) {
            disasterDescription = CONFIG.Velkora.ANOMALY_TABLES[severityLevel][d6Roll.total] || disasterDescription;
        }
        log(`屏障破裂判定結果：Roll=${total}, 嚴重度等級=${severityLabel}, 骰面=${d6Roll.total}, 新結痂閾值=${currentThreshold - 3}`, "info");

        const localizedDisaster = game.i18n.localize(disasterDescription);
        const scabTitle = game.i18n.format("VELKORA.Chat.ScabTitle", { label: severityLabel, roll: d6Roll.total });
        const scabNewThreshold = game.i18n.format("VELKORA.Chat.ScabNewThreshold", { threshold: currentThreshold - 3 });

        logExtraHtml += `<div style="margin-top: 6px; padding: 6px; background: rgba(0,0,0,0.3); border-left: 3px solid ${txtColor}; border-radius: 3px;">`;
        logExtraHtml += `<div style="color: ${txtColor}; font-weight: bold; font-size: 1.05em; margin-bottom: 4px;">${scabTitle}</div>`;
        logExtraHtml += `<div style="color: #e5e7eb; font-style: italic;">${localizedDisaster}</div>`;
        logExtraHtml += `</div>`;
        logExtraHtml += `<div style="color: #9ca3af; font-size: 0.85em; margin-top: 6px; text-align: right;">${scabNewThreshold}</div>`;

    } else {
        const crossedHalfway = (currentStress < halfThreshold) && (newValue >= halfThreshold);
        if (crossedHalfway && actualChange > 0) {
            const d8Roll = new Roll(`1d8`);
            await d8Roll.evaluate();
            
            let anomalyText = "VELKORA.Anomalies.Critical.Unknown";
            if (CONFIG.Velkora && CONFIG.Velkora.CRITICAL_ANOMALIES) {
                anomalyText = CONFIG.Velkora.CRITICAL_ANOMALIES[d8Roll.total] || anomalyText;
            }
            const localizedAnomaly = game.i18n.localize(anomalyText);
            log(`臨界點反常判定結果：骰面=${d8Roll.total}, 文案=${localizedAnomaly}`, "info");
            
            const criticalTitle = game.i18n.format("VELKORA.Chat.CriticalTitle", { roll: d8Roll.total });
            logExtraHtml += `<div style="margin-top: 6px; padding: 6px; background: rgba(251, 191, 36, 0.1); border-left: 3px solid #fbbf24; border-radius: 3px;">`;
            logExtraHtml += `<div style="color: #fbbf24; font-weight: bold; margin-bottom: 4px;">${criticalTitle}</div>`;
            logExtraHtml += `<div style="color: #e5e7eb; font-style: italic;">${localizedAnomaly}</div>`;
            logExtraHtml += `</div>`;
        }
    }

    const undoId = foundry.utils.randomID();
    const undoData = {
        id: undoId,
        actorId: actor?.id || null,
        stressDelta: actualChange,
        scabDelta: scabIncrease,
        hpLoss: hpLossData?.hp || 0,
        tempLoss: hpLossData?.temp || 0
    };
    const undoDataStr = encodeURIComponent(JSON.stringify(undoData));

    let logHTMLWrapper = `<div class="log-entry" id="log-${undoId}" style="padding: 8px; border-bottom: 1px solid rgba(255,255,255,0.1); font-size: 0.9em; line-height: 1.4; position: relative;">`;
    
    logHTMLWrapper += `<button class="hud-inline-undo-btn" data-undo="${undoDataStr}" style="position: absolute; top: 4px; right: 4px; background: transparent; border: none; color: #9ca3af; cursor: pointer; padding: 4px; font-size: 1.1em;" title="${game.i18n.localize("VELKORA.HUD.UndoHint") || "撤銷此變動"}"><i class="fas fa-undo"></i></button>`;

    logHTMLWrapper += `<div style="display:flex; justify-content:space-between; margin-bottom: 4px; padding-right: 24px;">
                    <strong style="color: #60a5fa; font-size: 1.1em;">${actorName}</strong>
                    <span style="color: ${color}; font-weight: bold; font-size: 1.1em;">${sign}${actualChange} ➜ ${newValue}</span>
                </div>
                <div style="color: #d1d5db; font-weight: bold;">${actionName}</div>`;

    if (hpLossData && sutureDamage > 0) {
        logHTMLWrapper += game.i18n.format("VELKORA.Chat.SutureLogHp", { damage: sutureDamage });
    }

    logHTMLWrapper += logExtraHtml;
    logHTMLWrapper += `</div>`;

    await game.settings.set("velkora-all-in-one", "stressValue", scabIncrease > 0 ? 0 : newValue);
    if (scabIncrease > 0) {
        await game.settings.set("velkora-all-in-one", "scabCount", scabCount + scabIncrease);
    }

    let logs = game.settings.get("velkora-all-in-one", "hudLogs") || [];
    logs.unshift(logHTMLWrapper);
    if (logs.length > 30) logs.pop(); 
    await game.settings.set("velkora-all-in-one", "hudLogs", logs);

    showVeilHUD(); 
}

async function applyInlineUndo(undoDataStr) {
    const undoData = JSON.parse(decodeURIComponent(undoDataStr));
    
    const currentStress = game.settings.get("velkora-all-in-one", "stressValue");
    const newStress = Math.max(0, currentStress - undoData.stressDelta);
    await game.settings.set("velkora-all-in-one", "stressValue", newStress);

    if (undoData.scabDelta > 0) {
        const currentScab = game.settings.get("velkora-all-in-one", "scabCount");
        await game.settings.set("velkora-all-in-one", "scabCount", Math.max(0, currentScab - undoData.scabDelta));
    }

    if (undoData.actorId && (undoData.hpLoss > 0 || undoData.tempLoss > 0)) {
        const actor = game.actors.get(undoData.actorId);
        if (actor) {
            const currentHp = actor.system.attributes?.hp?.value || 0;
            const currentTemp = actor.system.attributes?.hp?.temp || 0;
            await actor.update({
                "system.attributes.hp.value": currentHp + undoData.hpLoss,
                "system.attributes.hp.temp": currentTemp + undoData.tempLoss
            });
            ui.notifications.info(game.i18n.format("VELKORA.Notifications.SutureUndo", { name: actor.name, hp: undoData.hpLoss, temp: undoData.tempLoss }));
        }
    }

    let logs = game.settings.get("velkora-all-in-one", "hudLogs") || [];
    logs = logs.filter(logHtml => !logHtml.includes(`id="log-${undoData.id}"`));
    await game.settings.set("velkora-all-in-one", "hudLogs", logs);

    showVeilHUD();
}

// ==========================================
// HUD：DM 專屬浮動監控面板
// ==========================================
class VeilStressHUD extends Application {
    constructor(options) {
        super(options);
        this.options.title = game.i18n.localize("VELKORA.HUD.Title") || "👁️ 屏障監控面板";
        this._tablesExpanded = false; 
    }

    static get defaultOptions() {
        return foundry.utils.mergeObject(super.defaultOptions, {
            id: "veil-stress-hud",
            title: "👁️ 屏障監控面板",
            width: 380, height: 600, classes: ["dialog"], resizable: true
        });
    }

    async _renderInner(data) {
        const stress = game.settings.get("velkora-all-in-one", "stressValue");
        const baseThreshold = game.settings.get("velkora-all-in-one", "baseThreshold");
        const envModifier = game.settings.get("velkora-all-in-one", "envModifier");
        const scabCount = game.settings.get("velkora-all-in-one", "scabCount");
        const logs = game.settings.get("velkora-all-in-one", "hudLogs") || [];
        
        const currentThreshold = baseThreshold + envModifier - (scabCount * 3);
        const halfThreshold = currentThreshold / 2;
        
        const isCritical = stress >= halfThreshold;
        const dangerColor = isCritical ? '#ef4444' : '#4ade80';
        const criticalWarning = isCritical ? `<span style="color: #ef4444; font-weight: bold; text-shadow: 0 0 3px rgba(255,0,0,0.4);">${game.i18n.localize("VELKORA.HUD.CriticalStage")}</span>` : `<span style="color: #4ade80;">${game.i18n.localize("VELKORA.HUD.StableState")}</span>`;

        let primalCastersHtml = "";
        if (game.combat) {
            const primalCombatants = game.combat.combatants.filter(c => 
                c.actor && c.actor.type === "character" && 
                isPrimalCaster(c.actor)
            );

            if (primalCombatants.length > 0) {
                primalCastersHtml += `<div style="margin-bottom: 12px; background: rgba(0,0,0,0.3); padding: 8px; border-radius: 5px; border: 1px solid #374151;">`;
                primalCastersHtml += `<div style="font-size: 0.85em; color: #9ca3af; margin-bottom: 4px; border-bottom: 1px solid #4b5563; padding-bottom: 2px;">${game.i18n.localize("VELKORA.HUD.PartyRhythmStatus")}</div>`;
                primalCastersHtml += `<div style="display: grid; grid-template-columns: 1fr; gap: 6px;">`;
                
                const rhythmTable = CONFIG.Velkora?.PRIMAL_RHYTHM;
                const colors = { 1: "#4ade80", 2: "#f87171", 3: "#fbbf24", 4: "#60a5fa" };

                for (let c of primalCombatants) {
                    const seasonIdx = c.actor.getFlag("velkora-all-in-one", "currentSeason") || 1;
                    const seasonName = rhythmTable ? game.i18n.localize(rhythmTable[seasonIdx]?.name) : `Season ${seasonIdx}`;
                    const color = colors[seasonIdx] || "white";
                    
                    primalCastersHtml += `
                        <div style="display: flex; justify-content: space-between; align-items: center; font-size: 0.9em; padding: 3px 6px; background: rgba(255,255,255,0.05); border-radius: 3px;">
                            <span style="color: #e5e7eb; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 120px;" title="${c.actor.name}">${c.actor.name}</span>
                            <div style="display: flex; align-items: center; gap: 8px;">
                                <button class="hud-season-ctrl" data-actor-id="${c.actor.id}" data-dir="-1" style="background:transparent; border:none; color:#9ca3af; padding:0; cursor:pointer;" title="${game.i18n.localize("VELKORA.HUD.PrevSeason")}"><i class="fas fa-chevron-left"></i></button>
                                <strong style="color: ${color}; width: 45px; text-align: center;">${seasonName}</strong>
                                <button class="hud-season-ctrl" data-actor-id="${c.actor.id}" data-dir="1" style="background:transparent; border:none; color:#9ca3af; padding:0; cursor:pointer;" title="${game.i18n.localize("VELKORA.HUD.NextSeason")}"><i class="fas fa-chevron-right"></i></button>
                            </div>
                        </div>
                    `;
                }
                primalCastersHtml += `</div></div>`;
            }
        }

        const logsHtml = logs.length > 0 ? logs.join('') : `<div style="text-align:center; color:gray; margin-top:20px;">${game.i18n.localize("VELKORA.HUD.NoCastHistory")}</div>`;

        let tablesHtml = `<div style="font-size: 0.85em; color: #d1d5db; line-height: 1.4;">`;
        if (CONFIG.Velkora) {
            if (CONFIG.Velkora.CRITICAL_ANOMALIES) {
                tablesHtml += `<h4 style="color: #fca5a5; margin-bottom: 4px; border-bottom: 1px solid #fca5a5;">${game.i18n.localize("VELKORA.HUD.CriticalTableTitle")}</h4><ul style="padding-left: 15px; margin-top: 0; margin-bottom: 15px;">`;
                for (let i = 1; i <= 8; i++) tablesHtml += `<li style="margin-bottom: 4px;"><b>${i}</b>: ${game.i18n.localize(CONFIG.Velkora.CRITICAL_ANOMALIES[i])}</li>`;
                tablesHtml += `</ul>`;
            }
            if (CONFIG.Velkora.ANOMALY_TABLES) {
                const buildSeverityList = (title, color, obj) => {
                    let html = `<h4 style="color: ${color}; margin-bottom: 4px; margin-top: 10px;">${title}</h4><ul style="padding-left: 15px; margin-top: 0;">`;
                    for (let i = 1; i <= 6; i++) html += `<li style="margin-bottom: 4px;"><b>${i}</b>: ${game.i18n.localize(obj[i])}</li>`;
                    return html + `</ul>`;
                };
                tablesHtml += `<h4 style="color: #f87171; border-bottom: 1px solid #f87171; margin-bottom: 5px;">${game.i18n.localize("VELKORA.HUD.BreachTableTitle")}</h4>`;
                tablesHtml += buildSeverityList(game.i18n.localize("VELKORA.HUD.LightAnomalyTitle"), "#fcd34d", CONFIG.Velkora.ANOMALY_TABLES.light);
                tablesHtml += buildSeverityList(game.i18n.localize("VELKORA.HUD.ModerateAnomalyTitle"), "#fb923c", CONFIG.Velkora.ANOMALY_TABLES.moderate);
                tablesHtml += buildSeverityList(game.i18n.localize("VELKORA.HUD.SevereAnomalyTitle"), "#ef4444", CONFIG.Velkora.ANOMALY_TABLES.severe);
            }
            if (CONFIG.Velkora.PRIMAL_RHYTHM) {
                tablesHtml += `<h4 style="color: #60a5fa; border-bottom: 1px solid #60a5fa; margin-top: 15px; margin-bottom: 5px;">${game.i18n.localize("VELKORA.HUD.PrimalRhythmTableTitle")}</h4>`;
                for (let i = 1; i <= 4; i++) {
                    const season = CONFIG.Velkora.PRIMAL_RHYTHM[i];
                    tablesHtml += `<div style="margin-bottom: 8px;"><strong style="color: #93c5fd;">${game.i18n.localize(season.name)}</strong><br><i>${game.i18n.localize("VELKORA.HUD.HarmonyLabel")}</i>${game.i18n.localize(season.harmony)}<br><i>${game.i18n.localize("VELKORA.HUD.PulseLabel")}</i>${game.i18n.localize(season.pulse)}</div>`;
                }
            }
        } else {
            tablesHtml += `<p style="color: #f87171;">${game.i18n.localize("VELKORA.HUD.NoTable")}</p>`;
        }
        tablesHtml += `</div>`;
        const detailsState = this._tablesExpanded ? "open" : "";

        const htmlString = `
            <div style="display: flex; flex-direction: column; height: 100%; background: #111827; color: white; padding: 10px; border-radius: 5px; box-sizing: border-box;">
                
                <div style="text-align: center; margin-bottom: 8px;">
                    <h2 style="color: ${dangerColor}; border-bottom: none; margin: 0; font-size: 2.8em; font-weight: bold;">
                        ${stress} / ${currentThreshold}
                    </h2>
                    <div style="font-size: 1.1em; margin-bottom: 8px;">${game.i18n.localize("VELKORA.HUD.CurrentStatus")}: ${criticalWarning}</div>
                </div>

                <div style="font-size: 0.9em; margin-bottom: 12px; color: #d1d5db; background: rgba(0,0,0,0.3); padding: 8px 12px; border-radius: 5px; border: 1px solid #374151;">
                    <div style="display: flex; justify-content: space-between; margin-bottom: 6px;">
                        <span>${game.i18n.localize("VELKORA.HUD.BaseThreshold")}：</span><b>${baseThreshold}</b>
                    </div>
                    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px;">
                        <span>${game.i18n.localize("VELKORA.HUD.EnvModifier")}：</span>
                        <input type="number" id="hud-env-input" value="${envModifier}" style="width: 50px; height: 22px; background: #374151; color: white; border: 1px solid #6b7280; text-align: center; border-radius: 3px;">
                    </div>
                    <div style="display: flex; justify-content: space-between; margin-bottom: 6px;">
                        <span>${game.i18n.localize("VELKORA.HUD.ScabCount")}：</span><b>${scabCount}</b>
                    </div>
                    <div style="display: flex; justify-content: space-between; margin-top: 8px; padding-top: 8px; border-top: 1px solid #4b5563;">
                        <span style="font-weight: bold; color: white;">${game.i18n.localize("VELKORA.HUD.CurrentThreshold")}：</span>
                        <b style="color: white; font-size: 1.1em;">${currentThreshold}</b>
                    </div>
                </div>
                
                ${primalCastersHtml}

                <div style="display: flex; justify-content: space-between; gap: 4px; margin-bottom: 12px;">
                    <button class="hud-adj-btn" data-val="-5" style="flex:1; background: #374151; color: white; border:none; padding:6px; border-radius:3px;">${game.i18n.format("VELKORA.HUD.AdjustStressShort", { val: "-5" })}</button>
                    <button class="hud-adj-btn" data-val="-1" style="flex:1; background: #374151; color: white; border:none; padding:6px; border-radius:3px;">${game.i18n.format("VELKORA.HUD.AdjustStressShort", { val: "-1" })}</button>
                    <button class="hud-adj-btn" data-val="1" style="flex:1; background: #374151; color: white; border:none; padding:6px; border-radius:3px;">${game.i18n.format("VELKORA.HUD.AdjustStressShort", { val: "+1" })}</button>
                    <button class="hud-adj-btn" data-val="5" style="flex:1; background: #7f1d1d; color: white; border:none; padding:6px; border-radius:3px;">${game.i18n.format("VELKORA.HUD.AdjustStressShort", { val: "+5" })}</button>
                </div>

                <div style="flex-grow: 1; background: #1f2937; border-radius: 5px; border: 1px solid #374151; overflow-y: auto; padding: 5px; margin-bottom: 5px;">
                    ${logsHtml}
                </div>
                <div style="text-align: right; margin-bottom: 8px;">
                    <button id="hud-clear-logs" style="background: transparent; color: #9ca3af; border: none; font-size: 0.8em; cursor: pointer; padding: 0;">${game.i18n.localize("VELKORA.HUD.ClearLogs")}</button>
                </div>

                <details id="hud-tables-details" style="background: #1f2937; border: 1px solid #374151; border-radius: 5px; padding: 5px;" ${detailsState}>
                    <summary style="cursor: pointer; font-weight: bold; color: #60a5fa; outline: none; padding: 2px;">${game.i18n.localize("VELKORA.HUD.RulesCheatSheet")}</summary>
                    <div style="margin-top: 10px; max-height: 250px; overflow-y: auto; padding-right: 5px; border-top: 1px solid #374151; padding-top: 8px;">
                        ${tablesHtml}
                    </div>
                </details>

            </div>
        `;
        
        const div = document.createElement("div");
        div.style.height = "100%";
        div.innerHTML = htmlString;
        return typeof $ !== "undefined" ? $(div.firstElementChild) : div.firstElementChild;
    }

    activateListeners(html) {
        super.activateListeners(html);
        const htmlEl = html.length ? html[0] : html; 
        
        htmlEl.querySelectorAll('.hud-adj-btn').forEach(btn => {
            btn.addEventListener('click', async (ev) => {
                ev.preventDefault();
                await processStress(parseInt(ev.currentTarget.dataset.val, 10), 0, "DM", game.i18n.localize("VELKORA.HUD.AdjustStress"));
            });
        });

        htmlEl.querySelectorAll('.hud-season-ctrl').forEach(btn => {
            btn.addEventListener('click', async (ev) => {
                ev.preventDefault();
                const actorId = ev.currentTarget.dataset.actorId;
                const dir = parseInt(ev.currentTarget.dataset.dir, 10);
                const actor = game.actors.get(actorId);
                if (actor) {
                    let current = actor.getFlag("velkora-all-in-one", "currentSeason") || 1;
                    let next = current + dir;
                    if (next > 4) next = 1;
                    if (next < 1) next = 4;
                    await setActorSeason(actor, next, "神聖遙控");
                }
            });
        });

        const envInput = htmlEl.querySelector('#hud-env-input');
        if (envInput) {
            envInput.addEventListener('change', async (ev) => {
                const newVal = parseInt(ev.target.value, 10) || 0;
                await game.settings.set("velkora-all-in-one", "envModifier", newVal);
                showVeilHUD();
            });
        }

        htmlEl.querySelectorAll('.hud-inline-undo-btn').forEach(btn => {
            btn.addEventListener('click', async (ev) => {
                ev.preventDefault();
                await applyInlineUndo(ev.currentTarget.dataset.undo);
            });
        });

        const clearBtn = htmlEl.querySelector('#hud-clear-logs');
        if (clearBtn) {
            clearBtn.addEventListener('click', async (ev) => {
                ev.preventDefault();
                await game.settings.set("velkora-all-in-one", "hudLogs", []);
                showVeilHUD();
            });
        }

        const detailsEl = htmlEl.querySelector('#hud-tables-details');
        if (detailsEl) {
            detailsEl.addEventListener('toggle', (ev) => {
                this._tablesExpanded = detailsEl.open;
            });
        }
    }
}

function showVeilHUD() {
    const activeGM = game.users.find(u => u.isGM && u.active);
    if (!activeGM || activeGM.id !== game.user.id) return;

    if (!globalThis.veilHUD) {
        globalThis.veilHUD = new VeilStressHUD();
    }
    
    if (globalThis.veilHUD.rendered) {
        globalThis.veilHUD.render(true);
    } else {
        globalThis.veilHUD.render(true);
    }
}

// ==========================================
// 戰鬥開始與結束 Hook
// ==========================================
Hooks.on("combatStart", async (combat, updateData) => {
    const activeGM = game.users.find(u => u.isGM && u.active);
    
    if (activeGM && activeGM.id === game.user.id) {
        let totalLevel = 0;
        let pcCount = 0;
        combat.combatants.forEach(c => {
            if (c.actor && c.actor.type === "character") {
                let lvl = c.actor.system?.details?.level || 1;
                totalLevel += lvl;
                pcCount++;
            }
        });
        let avgLevel = pcCount > 0 ? Math.floor(totalLevel / pcCount) : 1;

        let baseThreshold = 10;
        if (avgLevel >= 5 && avgLevel <= 10) baseThreshold = 18;
        else if (avgLevel >= 11 && avgLevel <= 16) baseThreshold = 26;
        else if (avgLevel >= 17) baseThreshold = 35;

        for (let c of combat.combatants) {
            if (c.actor && c.actor.type === "character") {
                const isPrimal = isPrimalCaster(c.actor);
                if (isPrimal) {
                    let startSeason = Math.floor(Math.random() * 4) + 1;
                    // 開戰初始化季節：確保套用最初同諧被動
                    await setActorSeason(c.actor, startSeason, "開戰先攻");
                }
            }
        }

        new Dialog({
            title: game.i18n.localize("VELKORA.Dialog.Threshold.Title"),
            content: `
                <div style="margin-bottom: 10px;">
                    <p>${game.i18n.localize("VELKORA.Dialog.Threshold.AvgLevel")}<b>${avgLevel}</b></p>
                    <p>${game.i18n.localize("VELKORA.Dialog.Threshold.SuggestBase")}<b>${baseThreshold}</b></p>
                </div>
                <form>
                    <div class="form-group">
                        <label>${game.i18n.localize("VELKORA.Dialog.Threshold.EnvModifier")}</label>
                        <input type="number" id="env-modifier" value="0">
                    </div>
                </form>
                <p style="font-size: 0.9em; color: gray;">${game.i18n.localize("VELKORA.Dialog.Threshold.ConfirmHint")}</p>
            `,
            buttons: {
                confirm: {
                    icon: '<i class="fas fa-check"></i>',
                    label: game.i18n.localize("VELKORA.Dialog.Threshold.Confirm"),
                    callback: async (html) => {
                        const htmlEl = html.length ? html[0] : html;
                        const envModInput = htmlEl.querySelector("#env-modifier");
                        const envMod = envModInput ? parseInt(envModInput.value, 10) || 0 : 0;
                        
                        await game.settings.set("velkora-all-in-one", "baseThreshold", baseThreshold);
                        await game.settings.set("velkora-all-in-one", "envModifier", envMod);
                        await game.settings.set("velkora-all-in-one", "scabCount", 0);
                        await game.settings.set("velkora-all-in-one", "stressValue", 0);
                        await game.settings.set("velkora-all-in-one", "hudLogs", []); 

                        showVeilHUD();
                    }
                }
            },
            default: "confirm"
        }).render(true);
    }

    if (!game.user.isGM) {
        setTimeout(() => {
            combat.combatants.forEach(c => {
                const actor = c.actor;
                if (actor && actor.type === "character" && actor.isOwner) {
                    const isPrimal = isPrimalCaster(actor);
                    if (isPrimal) {
                        globalThis.primalHUDs = globalThis.primalHUDs || {};
                        if (!globalThis.primalHUDs[actor.id]) {
                            globalThis.primalHUDs[actor.id] = new PrimalRhythmHUD(actor);
                        }
                        globalThis.primalHUDs[actor.id].render(true);
                    }
                }
            });
        }, 1000);
    }
});

Hooks.on("deleteCombat", async (combat, options, userId) => {
    const activeGM = game.users.find(u => u.isGM && u.active);
    if (!activeGM || activeGM.id !== game.user.id) return;

    // 清除場上殘留的冰霜區域 MeasuredTemplate 模板
    const winterTemplates = canvas.scene?.templates?.filter(t => t.flags?.["velkora-all-in-one"]?.isWinterZone);
    if (winterTemplates && winterTemplates.length > 0) {
        try {
            await canvas.scene.deleteEmbeddedDocuments("MeasuredTemplate", winterTemplates.map(t => t.id));
            log(`已清除所有殘留的凜冬冰霜區域模板。`, "info");
        } catch (e) {
            log(`清除殘留的冰霜區域模板時出錯：${e.message}`, "warn");
        }
    }

    // 清除所有角色的季節與同諧被動
    const characters = game.actors.filter(a => a.type === "character");
    for (let actor of characters) {
        if (isPrimalCaster(actor)) {
            log(`戰鬥結束，清空角色季節與被動：${actor.name}`, "info");
            await actor.unsetFlag("velkora-all-in-one", "currentSeason");
            const oldHarmonies = actor.effects.filter(e => e.flags?.["velkora-all-in-one"]?.isHarmony);
            if (oldHarmonies.length > 0) {
                try {
                    await actor.deleteEmbeddedDocuments("ActiveEffect", oldHarmonies.map(e => e.id));
                } catch (e) {
                    // Silently ignore if already deleted
                }
            }
            try {
                const rotationItem = actor.items.find(i => i.flags?.["velkora-all-in-one"]?.isRotation || i.name === "主動輪轉" || i.name.startsWith("主動輪轉") || i.name === game.i18n.localize("VELKORA.Items.Rotation.Name") || i.name === "Active Rotation");
                if (rotationItem) {
                    await rotationItem.update({
                        name: game.i18n.localize("VELKORA.Items.Rotation.Name"),
                        "system.description.value": `<p>${game.i18n.localize("VELKORA.Items.Rotation.Description")}</p>`
                    });
                }
            } catch(e) {
                log(`清除主動輪轉特質時出錯：${e.message}`, "warn");
            }
        }
    }

    await game.settings.set("velkora-all-in-one", "stressValue", 0);
    await game.settings.set("velkora-all-in-one", "scabCount", 0);
    showVeilHUD(); 
});

// ==========================================
// 戰鬥更新與 MeasuredTemplate 區域追蹤 (凜冬脈衝)
// ==========================================
Hooks.on("updateCombat", async (combat, updateData, options, userId) => {
    const activeGM = game.users.find(u => u.isGM && u.active);
    if (!activeGM || activeGM.id !== game.user.id) return;

    if (updateData.turn !== undefined || updateData.round !== undefined) {
        // 1. 回合結束：遞減/刪除施法者所屬的冰霜區域
        const prevId = combat.previous.combatantId;
        if (prevId) {
            const winterTemplates = canvas.scene?.templates?.filter(t => t.flags?.["velkora-all-in-one"]?.isWinterZone && t.flags?.["velkora-all-in-one"]?.casterCombatantId === prevId);
            if (winterTemplates && winterTemplates.length > 0) {
                for (const t of winterTemplates) {
                    const remaining = t.flags["velkora-all-in-one"].remainingTurns - 1;
                    if (remaining <= 0) {
                        try {
                            await t.delete();
                            log(`凜冬冰霜區域存在時間結束，已自動刪除模板。`, "info");
                        } catch (e) {
                            log(`刪除殘留冰霜區域模板時出錯：${e.message}`, "warn");
                        }
                    } else {
                        await t.update({ "flags.velkora-all-in-one.remainingTurns": remaining });
                        log(`凜冬冰霜區域剩餘回合數：${remaining}`, "info");
                    }
                }
            }
        }

        // 2. 回合開始：偵測新回合 token 是否處於冰霜區域內，若處於則發送豁免卡片與說明並施加減速效果
        const currentCombatant = combat.combatant;
        const currentTokenDoc = currentCombatant?.token;
        const currentToken = currentTokenDoc?.object;
        if (currentToken && currentTokenDoc) {
            const activeWinterTemplates = canvas.scene?.templates?.filter(t => t.flags?.["velkora-all-in-one"]?.isWinterZone);
            if (activeWinterTemplates && activeWinterTemplates.length > 0) {
                let inZone = false;
                let highestDc = 10;
                let casterNames = [];
                
                for (const temp of activeWinterTemplates) {
                    const grid = canvas.scene.grid;
                    const dist = Math.hypot(currentToken.center.x - temp.x, currentToken.center.y - temp.y);
                    const radiusPixels = (temp.flags?.["velkora-all-in-one"]?.distance || temp.distance || 10) / grid.distance * grid.size;
                    
                    if (dist <= radiusPixels) {
                        inZone = true;
                        const dc = temp.flags?.["velkora-all-in-one"]?.spellDc || 10;
                        if (dc > highestDc) highestDc = dc;
                        const casterActorId = temp.flags?.["velkora-all-in-one"]?.casterActorId;
                        const casterName = game.actors.get(casterActorId)?.name || "施法者";
                        if (!casterNames.includes(casterName)) casterNames.push(casterName);
                    }
                }
                
                if (inZone) {
                    const castersText = casterNames.join("、");

                    // 施加本回合速度減半的暫時 ActiveEffect
                    const targetActor = currentTokenDoc.actor;
                    if (targetActor) {
                        // 先移除舊的凜冬減速效果（防止重複疊加）
                        const oldEffect = targetActor.effects.find(e => e.flags?.["velkora-all-in-one"]?.isWinterSlow);
                        if (oldEffect) {
                            try {
                                await oldEffect.delete();
                            } catch (e) {
                                // Silently ignore if already deleted
                            }
                        }

                        // 建立新效果（本回合結束後自動刪除由下方 prevId 清理負責）
                        const speedKeys = ["system.attributes.movement.walk", "system.attributes.movement.fly", "system.attributes.movement.swim", "system.attributes.movement.climb", "system.attributes.movement.burrow"];
                        const changes = speedKeys.map(key => ({
                            key,
                            mode: CONST.ACTIVE_EFFECT_MODES.MULTIPLY,
                            value: "0.5",
                            priority: 20
                        }));
                        await targetActor.createEmbeddedDocuments("ActiveEffect", [{
                            name: game.i18n.localize("VELKORA.Chat.WinterSlowEffectName"),
                            icon: "icons/magic/water/snowflake-ice-blue.webp",
                            changes,
                            origin: "velkora-all-in-one.winter-pulse",
                            disabled: false,
                            flags: { "velkora-all-in-one": { isWinterSlow: true, combatantId: currentCombatant.id } }
                        }]);
                        log(`凜冬減速效果已施加至 ${currentToken.name}`, "info");
                    }

                    const title = game.i18n.localize("VELKORA.Chat.WinterZoneReminderTitle");
                    const body = game.i18n.format("VELKORA.Chat.WinterZoneReminderBody", { name: currentToken.name, casters: castersText });
                    const speedHalf = game.i18n.localize("VELKORA.Chat.WinterZoneSpeedHalf");
                    const saveInfo = game.i18n.localize("VELKORA.Chat.WinterZoneSaveInfo");
                    const saveDc = game.i18n.format("VELKORA.Chat.WinterZoneSaveDc", { dc: highestDc });
                    const rollBtnText = game.i18n.format("VELKORA.Chat.WinterZoneRollBtn", { dc: highestDc });
                    const commandText = game.i18n.format("VELKORA.Chat.WinterZoneCommand", { dc: highestDc });

                    const chatContent = `
                        <div style="background: rgba(37, 99, 235, 0.08); padding: 8px; border-left: 4px solid #2563eb; border-radius: 3px;">
                            <h3 style="color: #1d4ed8; margin:0 0 4px 0; font-weight: bold;">${title}</h3>
                            <p style="margin: 0;">${body}</p>
                            <ul style="margin: 4px 0; padding-left: 20px; font-size: 0.95em; line-height: 1.4;">
                                <li>${speedHalf}</li>
                                <li>${saveInfo}</li>
                            </ul>
                            <div style="margin-top: 8px; display: flex; flex-direction: column; gap: 4px;">
                                <div style="text-align: center; font-weight: bold; color: #f8fafc; background: #1e293b; padding: 4px; border-radius: 3px;">
                                    ${saveDc}
                                </div>
                                <button class="roll-save-btn" data-dc="${highestDc}" data-token-id="${currentToken.id}" style="background: #1e3a8a; color: white; border: 1px solid #3b82f6; padding: 6px; border-radius: 3px; font-weight: bold; cursor: pointer; width: 100%; display: block; margin: 4px 0 0 0;">
                                    ${rollBtnText}
                                </button>
                                <div style="text-align: center; font-size: 0.8em; margin-top: 2px; color: #475569;">
                                    ${commandText}
                                </div>
                            </div>
                        </div>
                    `;
                    
                    ChatMessage.create({
                        speaker: ChatMessage.getSpeaker({ token: currentTokenDoc }),
                        content: chatContent
                    });
                } else {
                    // 離開冰霜區域時自動移除減速效果
                    const targetActor = currentTokenDoc.actor;
                    if (targetActor) {
                        const oldEffect = targetActor.effects.find(e => e.flags?.["velkora-all-in-one"]?.isWinterSlow);
                        if (oldEffect) {
                            try {
                                await oldEffect.delete();
                                log(`${currentToken.name} 已離開冰霜區域，移除凜冬減速效果。`, "info");
                            } catch (e) {
                                // Silently ignore if already deleted
                            }
                        }
                    }
                }
            } else {
                // 沒有活躍的冰霜區域時，清除所有殘留的凜冬減速效果
                const targetActor = currentTokenDoc.actor;
                if (targetActor) {
                    const oldEffect = targetActor.effects.find(e => e.flags?.["velkora-all-in-one"]?.isWinterSlow);
                    if (oldEffect) {
                        try {
                            await oldEffect.delete();
                        } catch (e) {
                            // Silently ignore if already deleted
                        }
                    }
                }
            }
        }
    }
});

// ==========================================
// 🧹 冰霜區域模板刪除事件監聽器：清除減速狀態 (Centralized winter zone cleanup)
// ==========================================
Hooks.on("deleteMeasuredTemplate", async (templateDoc, options, userId) => {
    const activeGM = game.users.find(u => u.isGM && u.active);
    if (!activeGM || activeGM.id !== game.user.id) return;

    if (templateDoc.flags?.["velkora-all-in-one"]?.isWinterZone) {
        log(`凜冬冰霜區域模板被手動或自動刪除：ID=${templateDoc.id}，開始進行減速效果清理...`, "info");
        
        // 檢查場上是否還有其他活躍的凜冬冰霜模板
        const otherTemplates = canvas.scene?.templates?.filter(t => t.id !== templateDoc.id && t.flags?.["velkora-all-in-one"]?.isWinterZone);
        if (!otherTemplates || otherTemplates.length === 0) {
            // 如果場上沒有冰霜區域了，立即清除所有 Token 的減速效果
            if (canvas.tokens?.placeables) {
                for (const tok of canvas.tokens.placeables) {
                    const act = tok.actor;
                    if (act) {
                        const winterSlows = act.effects.filter(e => e.flags?.["velkora-all-in-one"]?.isWinterSlow);
                        if (winterSlows.length > 0) {
                            try {
                                await act.deleteEmbeddedDocuments("ActiveEffect", winterSlows.map(e => e.id));
                                log(`所有冰霜區域已消失，已清除 ${tok.name} 殘留的凜冬減速效果。`, "info");
                            } catch (err) {
                                // Silently ignore if already deleted
                            }
                        }
                    }
                }
            }
        }
    }
});

// (註：敏捷豁免按鈕的點擊監聽器已重構為 ready 鉤子中的全局事件委託，此處無需重複註冊)