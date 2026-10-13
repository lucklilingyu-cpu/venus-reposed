import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { Reflector } from 'three/addons/objects/Reflector.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

/* ---------------------------------------------------------------
   Pose classes, gestures, palettes, sounds
---------------------------------------------------------------- */
const CLS = ['standing', 'walking', 'seated', 'crouching', 'reclining', 'horizontal'];
const CLASS = {
  standing:   { zh: '站立', en: 'Standing',   color: '#b59a63', sound: '展厅里的脚步与人声', dur: 0.5 },
  walking:    { zh: '行走', en: 'Walking',    color: '#7f9172', sound: '规律的脚步',         dur: 0.7 },
  seated:     { zh: '坐',   en: 'Seated',     color: '#b07a5c', sound: '椅子与翻页',         dur: 2 },
  crouching:  { zh: '蹲',   en: 'Crouching',  color: '#4f8c88', sound: '贴近地面的近场声',   dur: 0.3 },
  reclining:  { zh: '斜倚', en: 'Reclining',  color: '#a8707f', sound: '缓慢的叹息与长音',   dur: 1 },
  horizontal: { zh: '水平', en: 'Horizontal', color: '#77729e', sound: '呼吸与喷泉',         dur: 1.5 },
};
const GESTURES = {
  hair:     { zh: '举手拧发', note: '洗头、吹头发', cls: ['standing', 'crouching'] },
  oneleg:   { zh: '单腿平衡', note: '穿鞋、脱鞋',   cls: ['standing'] },
  cover:    { zh: '双臂遮挡', note: '冷、抱臂、害羞', cls: ['standing'] },
  lookback: { zh: '回眺',     note: '照镜子看背后', cls: ['standing'] },
};
/* default palettes (light, for the white-ceramic hall); replace from pictures in the data panel */
const DEFAULT_PALETTES = {
  standing:   ['#f6f3ee', '#ece3d4', '#d8c39a', '#b59a63', '#6e6152'],
  walking:    ['#f2f4ee', '#dfe6d6', '#b7c7a6', '#869a72', '#4f5b45'],
  seated:     ['#f7f1ea', '#ecdccb', '#d9b79a', '#b28466', '#6d4f40'],
  crouching:  ['#eef5f4', '#d6e8e6', '#a9cfcb', '#5f9c98', '#2f5e62'],
  reclining:  ['#f7f0f1', '#ecd9dc', '#d6aab3', '#a9707f', '#5e3b46'],
  horizontal: ['#f1f0f6', '#dcd9ea', '#b5afd2', '#7f78a8', '#45405f'],
};

/* ---------------------------------------------------------------
   The group's Goddess Sculpture Atlas: 105 records with display
   meshes, pose vocabulary and skeleton candidates.
   data/atlas.json is loaded once at start (top-level await);
   meshes are m/<id>.js, thumbnails t/<id>.webp.
   Regenerate them with tools/build_atlas.py.
---------------------------------------------------------------- */
const SKETCH_SRC = 'img/sketch.jpg'; // the group's concept sketch (not hung in the hall at the moment)
const ATLAS = await fetch('data/atlas.json').then(r => { if (!r.ok) throw new Error('atlas data ' + r.status); return r.json(); });
const REC = {}; ATLAS.records.forEach(r => { REC[r.id] = r; });
const FIGS = ATLAS.records.filter(r => r.kind === 'figure' && r.cls);
const recTitle = (r) => (r && r.t) ? r.t : `未识别作品 #${r ? r.id : '?'}`;
const recMeta = (r) => [r.a, r.d].filter(Boolean).join(' · ') || '作者与年代待考';
/* the sequence that already stands along the court's axis (illustrative, chosen from the atlas) */
// the hall's own sequence: the first seven, then nine more from the atlas, mixing the pose classes
const EXISTING = (() => {
  const ids = ['3', '7', '1', '24', '63', '32', '49'];
  for (const cls of ['standing', 'seated', 'walking', 'crouching', 'reclining', 'standing', 'seated', 'walking', 'standing']) {
    const r = FIGS.find(f => f.cls === cls && f.t && !ids.includes(f.id)); if (r) ids.push(r.id);
  }
  return ids.map(id => ({ id }));
})();
const ZH = {
  pose: { standing: '站立', seated: '坐', reclining: '斜倚 / 卧', crouching: '蹲', kneeling: '跪', upright_unspecified: '直立（未细分）', seated_or_reclining_uncertain: '坐或卧（不确定）', undetermined: '未定' },
  gest: { arm_bent: '手臂弯曲', arm_extended: '手臂伸展', arm_raised: '手臂上举', arm_lowered: '手臂下垂', arms_crossed: '双臂交叉', hand_at_head: '手在头部', hand_at_torso: '手在胸腹', hand_at_hip_or_thigh: '手在髋部或大腿', hand_at_lap_or_knee: '手在膝上', hand_on_support: '手扶支撑', hand_open: '手张开', hand_clenched: '握拳', supporting_head: '托头', supporting_body: '撑起身体', holding_object: '持物', holding_object_uncertain: '持物（不确定）', holding_fabric: '手持衣褶', supporting_other_figure: '托着另一人物', interaction_with_figure: '与人物互动', interaction_with_animal: '与动物互动', interaction_uncertain: '互动不确定', gesture_uncertain: '手势不确定', no_gesture_visible: '无可见手势', limbs_not_visible: '肢体不可见', limb_visibility_uncertain: '肢体可见性不确定', limbs_missing_or_truncated: '肢体残缺' },
  cloth: { drapery: '衣褶', garment_unspecified: '衣物', robe: '长袍', cloak: '斗篷', skirt: '裙', blouse: '上衣', bodice: '胸衣', stockings: '长袜', headdress: '头饰', helmet: '头盔', held_fabric: '手持布料', external_drapery: '外部布料', none_visible: '无可见衣物', none_visible_on_some_figures: '部分人物无衣物', garment_type_uncertain: '衣物类型不确定', clothing_conflict: '衣物描述矛盾', undetermined: '未定' },
  sk: { manual: '人工标注骨骼（草稿）', person: 'RTMPose 多视角人体骨骼（候选，未确认）', unirig: 'UniRig 自动骨骼（候选，未确认，已隐藏错位点）' },
};

const SAMPLE_DAYS = {
  group: '7:30 醒了赖床，8:00 刷牙，坐地铁去学校，上午画图，中午吃饭，下午三点肚子疼，傍晚散步，睡前躺着刷手机。',
  tutor: '早上去商店买东西，回来站着工作了一上午，中午吃饭，下午在沙发上靠着看书，晚上睡觉。',
  london: '8am woke up and stayed in bed, 9am shower and wash my hair, took the tube to the V&A, sketched in the Cast Courts, lunch at the café, walked along Exhibition Road, tied my shoes, evening lying on the sofa scrolling.',
};
