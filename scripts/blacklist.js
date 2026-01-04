const BLACKLIST_KEY = "aive_blacklist";

const listEl = document.getElementById("list");
const emptyEl = document.getElementById("empty");

function loadList() {
  chrome.storage.local.get(BLACKLIST_KEY, res => {
    const list = Array.isArray(res[BLACKLIST_KEY])
      ? res[BLACKLIST_KEY]
      : [];

    list.sort((a, b) => a.localeCompare(b));

    listEl.innerHTML = "";

    if (list.length === 0) {
      emptyEl.style.display = "block";
      return;
    }

    emptyEl.style.display = "none";

    list.forEach(domain => {
      const li = document.createElement("li");

      const name = document.createElement("span");
      name.textContent = domain;

      const btn = document.createElement("button");
      btn.textContent = "Remove";
      btn.onclick = () => removeSite(domain);

      li.appendChild(name);
      li.appendChild(btn);
      listEl.appendChild(li);
    });
  });
}

function removeSite(domain) {
  chrome.storage.local.get(BLACKLIST_KEY, res => {
    let list = Array.isArray(res[BLACKLIST_KEY])
      ? res[BLACKLIST_KEY]
      : [];

    list = list.filter(d => d !== domain);

    chrome.storage.local.set({ [BLACKLIST_KEY]: list }, loadList);
  });
}

loadList();
