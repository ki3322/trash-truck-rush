import type { FailReason, MissKind, RunOutcome } from '../types';
import type { Rng } from '../utils/rng';
import { pick } from '../utils/rng';

export const SUCCESS_LINES: readonly string[] = [
  '垃圾車司機都認識你了！',
  '這一丟，值得全巷口鼓掌！',
  '你不是倒垃圾，你是在創造傳奇！',
  '台灣人的極限運動！',
  '恭喜！垃圾不用再陪你一天！',
];

const STAIR_FAIL_LINES: readonly string[] = [
  '你還在{floor}樓，垃圾車已經走了。',
  '你的拖鞋比你更早抵達一樓。',
  '媽媽說還有一袋，結果垃圾車沒了。',
];

const THROW_FAIL_LINES: readonly string[] = [
  '你把垃圾丟出去了，但垃圾車沒有接住。',
  '這球很漂亮，可惜不是籃球場。',
  '垃圾袋飛得很遠，你的希望也是。',
  '恭喜！你成功把垃圾留在自己家附近。',
];

const TIMEOUT_LINES: readonly string[] = [
  '垃圾：我們明天見。',
  '今天不用倒垃圾了，因為垃圾車走了。',
  '明天請早。',
  '垃圾車已離開聊天室。',
];

const TRUCK_LEFT_LINES: readonly string[] = [
  '你成功下樓，但垃圾車不想等你。',
  '垃圾車已離開聊天室。',
  '明天請早。',
];

export const FAIL_REASON_TEXT: Readonly<Record<FailReason, string>> = {
  stairs_timeout: '還沒衝到一樓，時間就到了',
  throw_timeout: '倒數結束，垃圾還在手上',
  truck_left: '垃圾車開出巷口了',
  out_of_bags: '三次都沒丟進垃圾車',
};

export const MISS_TEXT: Readonly<Record<MissKind, string>> = {
  ground: '垃圾袋掉在地上了！',
  roof: '卡在車頂上，被載走了！',
  body: '在車身上彈來彈去，沒進！',
  rim: '在投入口邊緣彈飛了！',
  overshoot: '飛過垃圾車了！',
};

export function failLine(o: RunOutcome, rng: Rng): string {
  switch (o.failReason) {
    case 'stairs_timeout': {
      const floorLabel = toChineseFloor(o.stair.floorReached);
      const lines = o.stair.failedEvents.includes('slipper')
        ? [STAIR_FAIL_LINES[1]]
        : o.stair.failedEvents.includes('momBag')
          ? [STAIR_FAIL_LINES[2]]
          : STAIR_FAIL_LINES;
      return pick(rng, lines).replace('{floor}', floorLabel);
    }
    case 'out_of_bags':
      return pick(rng, THROW_FAIL_LINES);
    case 'truck_left':
      return pick(rng, TRUCK_LEFT_LINES);
    default:
      return pick(rng, TIMEOUT_LINES);
  }
}

export function successLine(rng: Rng): string {
  return pick(rng, SUCCESS_LINES);
}

const DIGITS = ['零', '一', '二', '三', '四', '五', '六', '七', '八', '九', '十'];

export function toChineseFloor(n: number): string {
  return DIGITS[n] ?? String(n);
}

export const DISCLAIMER =
  '現實生活請勿追逐行駛中的垃圾車或拋擲垃圾。本遊戲為誇張的虛構街機玩法。';

export const HOW_TO_PLAY: readonly string[] = [
  '① 聽到垃圾車音樂，從高樓衝下樓！',
  '　手機：左右交替點【左腳】【右腳】',
  '　電腦：交替按 A / D',
  '　同一隻腳連按會踉蹌喔！',
  '② 遇到突發事件，快按畫面上的按鈕',
  '　（電腦按空白鍵）。垃圾袋快破時要停下別踩！',
  '③ 到了巷口，瞄準移動中的垃圾車',
  '　手機：右手按住【丟垃圾】蓄力，同一指上下滑調角度，',
  '　　　　放開就丟！左手按住【追垃圾車！】往前追',
  '　電腦：按住左鍵拖曳瞄準＋蓄力，或用空白鍵',
  '④ 放開就丟！離越遠分數越高，共 3 袋機會',
  '　追車有體力限制，靠越近越好丟但分數越低（電腦按 D）',
  '　垃圾會反彈：打到車頂、邊緣也可能彈進車裡！',
];
