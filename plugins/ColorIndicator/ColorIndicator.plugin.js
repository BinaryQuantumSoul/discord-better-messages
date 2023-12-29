/**
 * @name ColorIndicator
 * @author QuantumSoul
 * @description Highlights color codes in discord chats
 * @version 0.0.1
 */

const CLASS_SCROLLER_INNER = BdApi.Webpack.getByKeys("navigationDescription", "scrollerInner")["scrollerInner"];
const CLASS_MESSAGE_LIST_ITEM = BdApi.Webpack.getByKeys("messageListItem")["messageListItem"];
const CLASS_MESSAGE_CONTENT = BdApi.Webpack.getByKeys("messageEditorCompact", "messageContent")["messageContent"];

module.exports = class Plugin {
  observer = null;

  start() {
    this.onSwitch();
  }

  stop() {
    if (this.observer) this.observer.disconnect();
  }

  onSwitch() {
    if (this.observer) this.observer.disconnect();
    this.observer = new MutationObserver(this.handleMutations);

    //format existing messages and listen to new ones
    const channels = document.querySelector("." + CLASS_SCROLLER_INNER);
    if (channels) {
      //existing one
      channels.querySelectorAll("." + CLASS_MESSAGE_CONTENT).forEach(this.parseMessage);

      //new ones
      this.observer.observe(channels, {
        childList: true,
        subtree: true,
        characterData: true,
      });
    }
  }

  handleMutations = (mutationsList) => {
    let timeoutId = null; //prevents formatting before edition

    for (const mutation of mutationsList) {
      if (mutation.type === "childList") {
        for (const node of mutation.addedNodes) {
          if (node.classList && node.classList.contains(CLASS_MESSAGE_CONTENT)) {
            timeoutId = setTimeout(() => {
              //unedited message
              this.parseMessage(node);
              timeoutId = null;
            }, 500);
          } else if (node.classList && node.classList.contains(CLASS_MESSAGE_LIST_ITEM)) {
            //new message
            this.parseMessage(node.querySelector("." + CLASS_MESSAGE_CONTENT));
          }
        }
      } else if (mutation.type === "characterData") {
        const messageContent = mutation.target.parentNode.closest("." + CLASS_MESSAGE_CONTENT);
        if (messageContent) {
          //edited message
          if (timeoutId !== null) {
            clearTimeout(timeoutId);
            timeoutId = null;
          }
          this.parseMessage(messageContent);
        }
      }
    }
  };

  parseMessage = (messageContent) => {
    const colorCodeRegex = /#(?:[0-9a-fA-F]{3,6})\b/g;

    messageContent.querySelectorAll('span').forEach((span) => {
      if (span.classList.contains('changed-indicator')) {
        const textNode = document.createTextNode(span.textContent);
        try {
            span.parentNode.replaceChild(textNode, span);
        } catch (error) {}
      }
    });

    messageContent.innerHTML = messageContent.innerHTML.replace(colorCodeRegex, (match) => {
      const textColor = this.isColorTooDark(match) ? 'white' : 'black';
      return `<span class="changed-indicator inline" style="background-color:${match}; color:${textColor};">${match}</span>`;
    });
  };

  isColorTooDark = (hexColor) => {
    const bigint = parseInt(hexColor.slice(1), 16);
    const rgb = { r: (bigint >> 16) & 255, g: (bigint >> 8) & 255, b: bigint & 255 };
    return 0.299 * rgb.r + 0.587 * rgb.g + 0.114 * rgb.b < 128;
  };
};
