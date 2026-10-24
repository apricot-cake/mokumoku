import { rankVideos } from "./generated/ranking.js";
import { moreVideos, readyPage } from "./generated/samples.js";

const DAY = 24 * 60 * 60 * 1000;
const ranges = {
  all: Infinity,
  week: 7,
  month: 30,
  quarter: 90,
  halfYear: 180,
  year: 365,
};
const themes = [
  ["道具のこと", "linear-gradient(135deg, #5d776f, #a6b8a8)"],
  ["休日の記録", "linear-gradient(135deg, #977957, #c5b392)"],
  ["机を整える", "linear-gradient(135deg, #72798a, #a5afbd)"],
  ["つくる時間", "linear-gradient(135deg, #9f7168, #cfafa0)"],
];
const period = document.querySelector("#period");
const loadButton = document.querySelector("#load-more");
const status = document.querySelector("#status");
const compact = new Intl.NumberFormat("ja", {
  notation: "compact",
  maximumFractionDigits: 1,
});
let videos = [...readyPage.snapshot.videos];
let loaded = false;

function row(video) {
  const item = document.createElement("li");
  item.className = "video-row";
  const theme = themes[Number(video.id.split("-").at(-1)) % themes.length];
  const thumbnail = document.createElement("div");
  thumbnail.className = "thumbnail";
  thumbnail.style.background = theme[1];
  thumbnail.textContent = theme[0];
  thumbnail.setAttribute("aria-hidden", "true");
  const info = document.createElement("div");
  info.className = "video-info";
  const titleLine = document.createElement("div");
  titleLine.className = "title-line";
  const title = document.createElement("p");
  title.className = "video-title";
  title.textContent = video.title;
  title.title = video.title;
  const ratio = document.createElement("span");
  ratio.className = "ratio";
  ratio.textContent = `×${video.ratio.toFixed(1)}`;
  ratio.title = "同じ経過時間の通常の再生数に対する倍率";
  const meta = document.createElement("p");
  meta.className = "video-meta";
  meta.textContent = `${compact.format(video.views)}回視聴 · ${video.ageText}`;
  titleLine.append(title, ratio);
  info.append(titleLine, meta);
  item.append(thumbnail, info);
  return item;
}

function render() {
  const ranking = rankVideos(videos);
  if (ranking.kind !== "ranked") return;
  const shown = ranking.videos.filter(
    (video) => video.ageMs <= ranges[period.value] * DAY,
  );
  document.querySelector("#videos").replaceChildren(...shown.map(row));
  document.querySelector("#fresh").replaceChildren(...ranking.fresh.map(row));
  const hidden = ranking.videos.length - shown.length;
  const hiddenText = document.querySelector("#hidden-count");
  hiddenText.hidden = hidden === 0;
  hiddenText.textContent = `それより古い動画 ${hidden} 本を非表示にしています`;
  status.textContent =
    period.value === "all"
      ? `読み込み済み ${videos.length} 本`
      : `範囲内 ${shown.length + ranking.fresh.length} 本`;
  loadButton.hidden = period.value !== "all";
  loadButton.disabled = loaded;
  loadButton.textContent = loaded ? "すべて読み込み済み" : "さらに読み込む";
}

function loadMore() {
  if (loaded) return;
  videos = [...videos, ...moreVideos];
  loaded = true;
}

loadButton.addEventListener("click", () => {
  loadMore();
  render();
});
period.addEventListener("change", () => {
  if (
    period.value !== "all" &&
    !videos.some((video) => video.ageMs > ranges[period.value] * DAY)
  )
    loadMore();
  render();
});
document.querySelector("#reset").addEventListener("click", () => {
  videos = [...readyPage.snapshot.videos];
  loaded = false;
  period.value = "all";
  document.querySelector(".panel-content").scrollTop = 0;
  render();
});
render();
