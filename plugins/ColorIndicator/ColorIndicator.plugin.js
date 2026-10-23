/**
 * @name ColorIndicator
 * @author QuantumSoul
 * @description Highlights color codes in Discord messages without destroying syntax highlighting.
 * @version 1.2.0 * 
 * @source https://github.com/BinaryQuantumSoul/discord-better-messages
 * @updateUrl https://raw.githubusercontent.com/BinaryQuantumSoul/discord-better-messages/main/plugins/ColorIndicator/ColorIndicator.plugin.js
 */

module.exports = class ColorIndicator {
    constructor() {
        this.observer = null;
        this.pendingMessages = new Set();
        this.updateTimer = null;

        this.defaultSettings = {
            luminanceThreshold: 0.5,

            darkTextColor: "#ffffff",
            lightTextColor: "#000000",

            swapColors: false,
            textOnly: false,

            paddingX: 4,
            paddingY: 1,
            borderRadius: 4
        };

        this.settings = this.loadSettings();
    }

    getName() {
        return "ColorIndicator";
    }

    start() {
        this.parseAllMessages();

        this.observer = new MutationObserver(
            (mutations) => this.handleMutations(mutations)
        );

        this.observer.observe(document.body, {
            childList: true,
            subtree: true,
            characterData: true
        });

        console.log(
            "[ColorIndicator] v1.2.0 started"
        );
    }

    stop() {
        if (this.observer) {
            this.observer.disconnect();
            this.observer = null;
        }

        if (this.updateTimer) {
            clearTimeout(this.updateTimer);
            this.updateTimer = null;
        }

        this.pendingMessages.clear();

        this.restoreAllIndicators();

        console.log(
            "[ColorIndicator] stopped"
        );
    }

    /*
     * ============================================================
     * Settings
     * ============================================================
     */

    loadSettings() {
        try {
            const saved =
                BdApi.Data.load(
                    this.getName(),
                    "settings"
                ) || {};

            return {
                ...this.defaultSettings,
                ...saved
            };
        } catch (error) {
            console.error(
                "[ColorIndicator] Could not load settings:",
                error
            );

            return {
                ...this.defaultSettings
            };
        }
    }

    saveSettings() {
        try {
            BdApi.Data.save(
                this.getName(),
                "settings",
                this.settings
            );
        } catch (error) {
            console.error(
                "[ColorIndicator] Could not save settings:",
                error
            );
        }
    }

    updateSetting(key, value) {
        this.settings[key] = value;

        this.saveSettings();
        this.refreshIndicatorStyles();
    }

    /*
     * ============================================================
     * Mutation handling
     * ============================================================
     */

    handleMutations(mutations) {
        for (const mutation of mutations) {
            if (mutation.type === "characterData") {
                const message =
                    this.findMessageElement(
                        mutation.target
                    );

                if (message) {
                    this.queueMessage(message);
                }

                continue;
            }

            if (mutation.type !== "childList") {
                continue;
            }

            for (const node of mutation.addedNodes) {
                if (
                    node.nodeType ===
                    Node.TEXT_NODE
                ) {
                    const message =
                        this.findMessageElement(
                            node
                        );

                    if (message) {
                        this.queueMessage(
                            message
                        );
                    }

                    continue;
                }

                if (
                    !(node instanceof HTMLElement)
                ) {
                    continue;
                }

                /*
                 * Änderungen, die wir selbst erzeugt haben,
                 * ignorieren.
                 */
                if (
                    node.classList.contains(
                        "color-indicator-span"
                    )
                ) {
                    continue;
                }

                /*
                 * Element selbst ist eine Nachricht.
                 */
                if (
                    node.matches(
                        '[id^="message-content-"]'
                    )
                ) {
                    this.queueMessage(node);
                }

                /*
                 * Neue Nachrichten innerhalb eines
                 * hinzugefügten Discord-Containers.
                 */
                node
                    .querySelectorAll?.(
                        '[id^="message-content-"]'
                    )
                    .forEach((message) => {
                        this.queueMessage(
                            message
                        );
                    });

                /*
                 * Änderung innerhalb einer bestehenden
                 * Nachricht.
                 */
                const parentMessage =
                    this.findMessageElement(
                        node
                    );

                if (parentMessage) {
                    this.queueMessage(
                        parentMessage
                    );
                }
            }
        }
    }

    queueMessage(message) {
        if (!message) {
            return;
        }

        this.pendingMessages.add(message);

        if (this.updateTimer) {
            clearTimeout(
                this.updateTimer
            );
        }

        /*
         * Discord verändert beim Rendern teilweise
         * mehrmals kurz hintereinander den DOM.
         *
         * Dadurch warten wir kurz, bis Discord mit
         * dem Rendering fertig ist.
         */
        this.updateTimer =
            setTimeout(() => {
                const messages = [
                    ...this.pendingMessages
                ];

                this.pendingMessages.clear();
                this.updateTimer = null;

                for (
                    const message
                    of messages
                ) {
                    if (
                        message.isConnected
                    ) {
                        this.parseMessage(
                            message
                        );
                    }
                }
            }, 100);
    }

    findMessageElement(node) {
        let element = null;

        if (
            node instanceof HTMLElement
        ) {
            element = node;
        } else {
            element =
                node.parentElement;
        }

        return element?.closest?.(
            '[id^="message-content-"]'
        ) || null;
    }

    /*
     * ============================================================
     * Message parsing
     * ============================================================
     */

    parseAllMessages() {
        document
            .querySelectorAll(
                '[id^="message-content-"]'
            )
            .forEach((message) => {
                this.parseMessage(
                    message
                );
            });
    }

    parseMessage(messageElement) {
        if (
            !messageElement ||
            !messageElement.isConnected
        ) {
            return;
        }

        const walker =
            document.createTreeWalker(
                messageElement,
                NodeFilter.SHOW_TEXT,
                {
                    acceptNode: (node) =>
                        this.shouldProcessTextNode(
                            node
                        )
                }
            );

        const textNodes = [];

        while (
            walker.nextNode()
        ) {
            textNodes.push(
                walker.currentNode
            );
        }

        /*
         * Wichtig:
         *
         * Erst alle Nodes sammeln und DANACH
         * verändern.
         *
         * Sonst verändert replaceWith() den DOM
         * während der TreeWalker noch läuft.
         */
        for (
            const textNode
            of textNodes
        ) {
            this.parseTextNode(
                textNode
            );
        }
    }

    shouldProcessTextNode(node) {
        if (
            !node ||
            node.nodeType !==
                Node.TEXT_NODE
        ) {
            return NodeFilter.FILTER_REJECT;
        }

        if (
            !node.nodeValue ||
            !node.nodeValue.trim()
        ) {
            return NodeFilter.FILTER_REJECT;
        }

        const parent =
            node.parentElement;

        if (!parent) {
            return NodeFilter.FILTER_REJECT;
        }

        /*
         * Niemals unsere eigenen Elemente
         * erneut bearbeiten.
         */
        if (
            parent.closest(
                ".color-indicator-span"
            )
        ) {
            return NodeFilter.FILTER_REJECT;
        }

        /*
         * Interaktive Elemente innerhalb einer
         * Nachricht nicht verändern.
         */
        if (
            parent.closest(
                "button, input, textarea, select"
            )
        ) {
            return NodeFilter.FILTER_REJECT;
        }

        /*
         * Discord kann unsichtbare Accessibility-
         * Elemente innerhalb von Nachrichten haben.
         */
        if (
            parent.closest(
                '[aria-hidden="true"]'
            )
        ) {
            return NodeFilter.FILTER_REJECT;
        }

        return NodeFilter.FILTER_ACCEPT;
    }

    parseTextNode(textNode) {
        if (
            !textNode ||
            !textNode.isConnected
        ) {
            return;
        }

        const text =
            textNode.nodeValue;

        if (!text) {
            return;
        }

        const regex =
            this.getColorRegex();

        const matches = [
            ...text.matchAll(regex)
        ];

        if (
            matches.length === 0
        ) {
            return;
        }

        const fragment =
            document.createDocumentFragment();

        let lastIndex = 0;

        for (
            const match
            of matches
        ) {
            const color =
                match[0];

            const startIndex =
                match.index;

            if (
                startIndex >
                lastIndex
            ) {
                fragment.appendChild(
                    document.createTextNode(
                        text.substring(
                            lastIndex,
                            startIndex
                        )
                    )
                );
            }

            if (
                this.isValidColor(
                    color
                )
            ) {
                fragment.appendChild(
                    this.createColorElement(
                        color
                    )
                );
            } else {
                fragment.appendChild(
                    document.createTextNode(
                        color
                    )
                );
            }

            lastIndex =
                startIndex +
                color.length;
        }

        if (
            lastIndex <
            text.length
        ) {
            fragment.appendChild(
                document.createTextNode(
                    text.substring(
                        lastIndex
                    )
                )
            );
        }

        /*
         * Wichtig für highlight.js:
         *
         * Wir ersetzen ausschließlich diesen
         * TextNode.
         *
         * Beispiel:
         *
         * <span class="hljs-string">
         *     "#ff0000"
         * </span>
         *
         * wird zu:
         *
         * <span class="hljs-string">
         *     "
         *     <span class="color-indicator-span">
         *         #ff0000
         *     </span>
         *     "
         * </span>
         *
         * Der hljs-string Container bleibt bestehen.
         */
        textNode.replaceWith(
            fragment
        );
    }

    getColorRegex() {
        /*
         * Unterstützt:
         *
         * #fff
         * #ffff
         * #ffffff
         * #ffffffff
         *
         * rgb(...)
         * rgba(...)
         *
         * hsl(...)
         * hsla(...)
         */

        return /#(?:[0-9a-fA-F]{8}|[0-9a-fA-F]{6}|[0-9a-fA-F]{4}|[0-9a-fA-F]{3})\b|\b(?:rgb|rgba|hsl|hsla)\([^)]*\)/g;
    }

    /*
     * ============================================================
     * Indicator
     * ============================================================
     */

    createColorElement(color) {
        const span =
            document.createElement(
                "span"
            );

        span.className =
            "color-indicator-span";

        span.dataset.colorIndicatorColor =
            color;

        span.textContent =
            color;

        this.applyIndicatorStyle(
            span,
            color
        );

        return span;
    }

    applyIndicatorStyle(
        span,
        color
    ) {
        const luminance =
            this.calculateLuminance(
                color
            );

        const contrastColor =
            luminance <
            this.settings
                .luminanceThreshold
                ? this.settings
                      .darkTextColor
                : this.settings
                      .lightTextColor;

        /*
         * Alte Styles entfernen.
         */
        span.style.removeProperty(
            "background-color"
        );

        span.style.removeProperty(
            "color"
        );

        span.style.removeProperty(
            "padding"
        );

        span.style.removeProperty(
            "margin"
        );

        span.style.removeProperty(
            "border-radius"
        );

        span.style.removeProperty(
            "display"
        );

        span.style.removeProperty(
            "box-sizing"
        );

        /*
         * Nur farbiger Text.
         */
        if (
            this.settings.textOnly
        ) {
            span.style.color =
                color;

            span.style.backgroundColor =
                "transparent";

            return;
        }

        /*
         * Vordergrund und Hintergrund tauschen.
         */
        if (
            this.settings.swapColors
        ) {
            span.style.color =
                color;

            span.style.backgroundColor =
                contrastColor;
        } else {
            span.style.backgroundColor =
                color;

            span.style.color =
                contrastColor;
        }

        span.style.padding =
            `${this.settings.paddingY}px ` +
            `${this.settings.paddingX}px`;

        span.style.margin =
            "0 1px";

        span.style.borderRadius =
            `${this.settings.borderRadius}px`;

        span.style.display =
            "inline-block";

        span.style.boxSizing =
            "border-box";
    }

    refreshIndicatorStyles() {
        document
            .querySelectorAll(
                ".color-indicator-span"
            )
            .forEach((span) => {
                const color =
                    span.dataset
                        .colorIndicatorColor;

                if (
                    !color ||
                    !this.isValidColor(
                        color
                    )
                ) {
                    return;
                }

                this.applyIndicatorStyle(
                    span,
                    color
                );
            });
    }

    restoreAllIndicators() {
        document
            .querySelectorAll(
                ".color-indicator-span"
            )
            .forEach((span) => {
                const text =
                    span.textContent || "";

                span.replaceWith(
                    document.createTextNode(
                        text
                    )
                );
            });
    }

    /*
     * ============================================================
     * Color handling
     * ============================================================
     */

    isValidColor(color) {
        const option =
            new Option();

        option.style.color = "";
        option.style.color =
            color;

        return (
            option.style.color !== ""
        );
    }

    colorToRgb(colorString) {
        const element =
            document.createElement(
                "span"
            );

        element.style.color =
            colorString;

        element.style.position =
            "absolute";

        element.style.visibility =
            "hidden";

        element.style.pointerEvents =
            "none";

        document.body.appendChild(
            element
        );

        const color =
            window
                .getComputedStyle(
                    element
                )
                .color;

        element.remove();

        return color;
    }

    calculateLuminance(
        colorString
    ) {
        const rgbString =
            this.colorToRgb(
                colorString
            );

        const values =
            rgbString.match(
                /[\d.]+/g
            );

        if (
            !values ||
            values.length < 3
        ) {
            return 0;
        }

        const r =
            parseFloat(
                values[0]
            );

        const g =
            parseFloat(
                values[1]
            );

        const b =
            parseFloat(
                values[2]
            );

        const alpha =
            values[3] !== undefined
                ? parseFloat(
                      values[3]
                  )
                : 1;

        /*
         * Gleiche Berechnung wie bisher,
         * inklusive Alpha.
         */
        return (
            (
                0.299 * r +
                0.587 * g +
                0.114 * b
            ) *
            alpha
        ) / 255;
    }

    /*
     * ============================================================
     * Settings Panel
     * ============================================================
     */

    getSettingsPanel() {
        const panel =
            document.createElement(
                "div"
            );

        panel.style.padding =
            "10px 4px 24px";

        const title =
            document.createElement(
                "h2"
            );

        title.textContent =
            "ColorIndicator";

        title.style.marginBottom =
            "6px";

        const description =
            document.createElement(
                "div"
            );

        description.textContent =
            "Configure how detected color values are displayed.";

        description.style.marginBottom =
            "24px";

        description.style.color =
            "var(--text-muted)";

        panel.append(
            title,
            description
        );

        panel.appendChild(
            this.createSliderSetting(
                "Luminance threshold",
                "Determines when the light or dark contrast color is used.",
                "luminanceThreshold",
                0,
                1,
                0.01
            )
        );

        panel.appendChild(
            this.createColorSetting(
                "Text color on dark background",
                "Used for colors below the luminance threshold.",
                "darkTextColor"
            )
        );

        panel.appendChild(
            this.createColorSetting(
                "Text color on light background",
                "Used for colors above the luminance threshold.",
                "lightTextColor"
            )
        );

        panel.appendChild(
            this.createToggleSetting(
                "Swap foreground/background",
                "Use the detected color for the text and the contrast color for the background.",
                "swapColors"
            )
        );

        panel.appendChild(
            this.createToggleSetting(
                "Colored text only",
                "Display the detected color as text without a colored background.",
                "textOnly"
            )
        );

        panel.appendChild(
            this.createNumberSetting(
                "Horizontal padding",
                "Horizontal spacing around highlighted color values.",
                "paddingX",
                0,
                20
            )
        );

        panel.appendChild(
            this.createNumberSetting(
                "Vertical padding",
                "Vertical spacing around highlighted color values.",
                "paddingY",
                0,
                20
            )
        );

        panel.appendChild(
            this.createNumberSetting(
                "Border radius",
                "Corner radius of the color indicator.",
                "borderRadius",
                0,
                20
            )
        );

        const resetButton =
            document.createElement(
                "button"
            );

        resetButton.type =
            "button";

        resetButton.textContent =
            "Reset to defaults";

        resetButton.style.marginTop =
            "20px";

        resetButton.style.padding =
            "8px 14px";

        resetButton.style.border =
            "none";

        resetButton.style.borderRadius =
            "4px";

        resetButton.style.cursor =
            "pointer";

        resetButton.style.background =
            "var(--button-secondary-background)";

        resetButton.style.color =
            "var(--text-normal)";

        resetButton.addEventListener(
            "click",
            () => {
                this.settings = {
                    ...this.defaultSettings
                };

                this.saveSettings();
                this.refreshIndicatorStyles();

                panel.replaceWith(
                    this.getSettingsPanel()
                );
            }
        );

        panel.appendChild(
            resetButton
        );

        return panel;
    }

    createSettingContainer(
        name,
        description
    ) {
        const container =
            document.createElement(
                "div"
            );

        container.style.padding =
            "14px 0";

        container.style.borderBottom =
            "1px solid var(--background-modifier-accent)";

        const label =
            document.createElement(
                "div"
            );

        label.textContent =
            name;

        label.style.fontWeight =
            "600";

        label.style.marginBottom =
            "4px";

        const desc =
            document.createElement(
                "div"
            );

        desc.textContent =
            description;

        desc.style.color =
            "var(--text-muted)";

        desc.style.fontSize =
            "13px";

        desc.style.marginBottom =
            "10px";

        container.append(
            label,
            desc
        );

        return container;
    }

    createSliderSetting(
        name,
        description,
        key,
        min,
        max,
        step
    ) {
        const container =
            this.createSettingContainer(
                name,
                description
            );

        const row =
            document.createElement(
                "div"
            );

        row.style.display =
            "flex";

        row.style.alignItems =
            "center";

        row.style.gap =
            "12px";

        const slider =
            document.createElement(
                "input"
            );

        slider.type =
            "range";

        slider.min =
            String(min);

        slider.max =
            String(max);

        slider.step =
            String(step);

        slider.value =
            String(
                this.settings[key]
            );

        slider.style.flex =
            "1";

        const value =
            document.createElement(
                "span"
            );

        value.textContent =
            Number(
                this.settings[key]
            ).toFixed(2);

        value.style.minWidth =
            "42px";

        value.style.textAlign =
            "right";

        value.style.fontFamily =
            "var(--font-code)";

        slider.addEventListener(
            "input",
            () => {
                const newValue =
                    Number(
                        slider.value
                    );

                value.textContent =
                    newValue.toFixed(
                        2
                    );

                this.updateSetting(
                    key,
                    newValue
                );
            }
        );

        row.append(
            slider,
            value
        );

        container.appendChild(
            row
        );

        return container;
    }

    createColorSetting(
        name,
        description,
        key
    ) {
        const container =
            this.createSettingContainer(
                name,
                description
            );

        const row =
            document.createElement(
                "div"
            );

        row.style.display =
            "flex";

        row.style.alignItems =
            "center";

        row.style.gap =
            "10px";

        const picker =
            document.createElement(
                "input"
            );

        picker.type =
            "color";

        picker.value =
            this.settings[key];

        picker.style.width =
            "48px";

        picker.style.height =
            "32px";

        picker.style.cursor =
            "pointer";

        const text =
            document.createElement(
                "input"
            );

        text.type =
            "text";

        text.value =
            this.settings[key];

        text.style.width =
            "110px";

        text.style.padding =
            "6px 8px";

        text.style.borderRadius =
            "4px";

        text.style.border =
            "1px solid var(--background-modifier-accent)";

        text.style.background =
            "var(--input-background)";

        text.style.color =
            "var(--text-normal)";

        text.style.fontFamily =
            "var(--font-code)";

        const apply =
            (newColor) => {
                if (
                    !/^#[0-9a-fA-F]{6}$/.test(
                        newColor
                    )
                ) {
                    return;
                }

                const normalized =
                    newColor.toLowerCase();

                picker.value =
                    normalized;

                text.value =
                    normalized;

                this.updateSetting(
                    key,
                    normalized
                );
            };

        picker.addEventListener(
            "input",
            () => {
                apply(
                    picker.value
                );
            }
        );

        text.addEventListener(
            "change",
            () => {
                apply(
                    text.value.trim()
                );
            }
        );

        row.append(
            picker,
            text
        );

        container.appendChild(
            row
        );

        return container;
    }

    createToggleSetting(
        name,
        description,
        key
    ) {
        const container =
            this.createSettingContainer(
                name,
                description
            );

        const checkbox =
            document.createElement(
                "input"
            );

        checkbox.type =
            "checkbox";

        checkbox.checked =
            Boolean(
                this.settings[key]
            );

        checkbox.style.width =
            "20px";

        checkbox.style.height =
            "20px";

        checkbox.style.cursor =
            "pointer";

        checkbox.addEventListener(
            "change",
            () => {
                this.updateSetting(
                    key,
                    checkbox.checked
                );
            }
        );

        container.appendChild(
            checkbox
        );

        return container;
    }

    createNumberSetting(
        name,
        description,
        key,
        min,
        max
    ) {
        const container =
            this.createSettingContainer(
                name,
                description
            );

        const input =
            document.createElement(
                "input"
            );

        input.type =
            "number";

        input.min =
            String(min);

        input.max =
            String(max);

        input.step =
            "1";

        input.value =
            String(
                this.settings[key]
            );

        input.style.width =
            "80px";

        input.style.padding =
            "6px 8px";

        input.style.borderRadius =
            "4px";

        input.style.border =
            "1px solid var(--background-modifier-accent)";

        input.style.background =
            "var(--input-background)";

        input.style.color =
            "var(--text-normal)";

        input.addEventListener(
            "change",
            () => {
                let value =
                    Number(
                        input.value
                    );

                if (
                    !Number.isFinite(
                        value
                    )
                ) {
                    value =
                        this.defaultSettings[
                            key
                        ];
                }

                value =
                    Math.max(
                        min,
                        Math.min(
                            max,
                            value
                        )
                    );

                input.value =
                    String(
                        value
                    );

                this.updateSetting(
                    key,
                    value
                );
            }
        );

        container.appendChild(
            input
        );

        return container;
    }
};