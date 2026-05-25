"""Build game_data.xlsx with 3 sheets: 卡牌 / 敌人 / 召唤物"""
from openpyxl import Workbook
from openpyxl.styles import Font, PatternFill, Alignment, Border, Side

wb = Workbook()
font_arial = 'Arial'
bold_white = Font(name=font_arial, bold=True, color='FFFFFF')
bold = Font(name=font_arial, bold=True)
normal = Font(name=font_arial)
thin_border = Border(
    left=Side(style='thin', color='888888'),
    right=Side(style='thin', color='888888'),
    top=Side(style='thin', color='888888'),
    bottom=Side(style='thin', color='888888'),
)

HEADER_FILL = PatternFill('solid', start_color='2A3242')

def header_row(sheet, columns):
    for col, name in enumerate(columns, 1):
        c = sheet.cell(row=1, column=col)
        c.value = name
        c.font = bold_white
        c.fill = HEADER_FILL
        c.alignment = Alignment(horizontal='center', vertical='center')
        c.border = thin_border

def style_data(sheet, n_rows, n_cols):
    for r in range(2, n_rows + 2):
        for c in range(1, n_cols + 1):
            cell = sheet.cell(row=r, column=c)
            cell.font = normal
            cell.alignment = Alignment(vertical='center', wrap_text=True)
            cell.border = thin_border

# ============== 卡牌 sheet ==============
cards_sheet = wb.active
cards_sheet.title = '卡牌'

CARDS = [
    # (流派, 编号, 名称, 费用, 稀有度, 描述, 价值核算, 备注)
    # —— 奥弹流派 (16 张) ——
    ('奥弹', 1, '凝视', 1, 'epic', '使用：子弹+1 / 展露：子弹+1', '6 + 展露效果 6×3=18 → epic', ''),
    ('奥弹', 2, '烟花', 2, 'common', '洗入 3 张奥术飞弹', '3 张奥弹 × 价值 3 = 9 + 洗入扣 21', ''),
    ('奥弹', 3, '军备库', 3, 'epic', '洗入 3 张奥术飞弹 + 1 张随机基础牌', '3 奥弹 + 1 随机基础', ''),
    ('奥弹', 4, '奥弹之雨', 3, 'legendary', '洗入 5 张奥术飞弹 + 全部立刻翻面（连环爆发）', '5 奥弹 × 立刻触发', ''),
    ('奥弹', 5, '奥弹齐发', 2, 'rare', '洗入 3 张奥术飞弹并立刻翻面（瞬时触发）', '3 奥弹 + 立刻翻面', ''),
    ('奥弹', 6, '加倍奥弹', 2, 'rare', '本回合手牌中所有奥弹伤害 ×2', '本回合 buff', ''),
    ('奥弹', 7, '爆炸奥弹', 2, 'rare', '本回合所有奥弹命中爆炸（AOE 伤害 = 该奥弹自身伤害）', '本回合 buff', ''),
    ('奥弹', 8, '击退奥弹', 1, 'common', '本回合所有奥弹命中击退敌人', '本回合 buff', ''),
    ('奥弹', 9, '充能奥弹', 1, 'common', '本回合所有奥弹击杀回 1 水晶', '本回合 buff', ''),
    ('奥弹', 10, '过载奥弹', 2, 'epic', '本回合每发奥弹后追加 1 张奥术飞弹（链式）', '本回合 buff（链式）', ''),
    ('奥弹', 11, '奥光', 1, 'common', '展露：本回合下一发奥弹伤害 ×2', '展露', ''),
    ('奥弹', 12, '奥能回响', 1, 'rare', '本回合每发射 1 颗奥弹，立即洗入 1 张奥术飞弹', '本回合 buff', ''),
    ('奥弹', 13, '奥能聚焦', 2, 'rare', '展露：把手牌中所有奥弹立即翻面（连环触发）', '展露', ''),
    ('奥弹', 14, '奥术涌动', 1, 'common', '展露：把手牌中 1 张奥弹 + 其两侧相邻卡 一并翻面', '展露', ''),
    ('奥弹', 15, '预知', 1, 'common', '使用：随机一张手牌立即翻面（若是奥弹自动触发）', '随机翻面', ''),
    ('奥弹', 16, '奥弹之书', 2, 'rare', '展露：每当你洗入卡时发射 1 颗奥术飞弹', '展露', ''),
    # —— 弹射流派 (12 张) ——
    ('弹射', 17, '粘液球', 1, 'common', '弹射+4', '弹射 4×2=8', ''),
    ('弹射', 18, '跳跳球', 2, 'common', '弹射+6', '弹射 6×2=12', ''),
    ('弹射', 19, '墨镜', 2, 'epic', '弹射+2 穿透+2。任一耗尽时从对方借 1', '4 + 8 + 借位机制', ''),
    ('弹射', 20, '超弹', 3, 'legendary', '弹射+10', '弹射 10×2=20', ''),
    ('弹射', 21, '共鸣弹', 2, 'common', '弹射 +连击数', '弹射 × combo', ''),
    ('弹射', 22, '折射', 1, 'common', '展露：弹射+1', '展露 × 2 = 6 → 1费允许', ''),
    ('弹射', 23, '弹射爆炸', 2, 'rare', '弹射时小爆炸（AOE 伤害 = 该子弹伤害 × 0.5）', '弹射触发', ''),
    ('弹射', 24, '弹射爆裂', 3, 'epic', '弹射时大爆炸（AOE 伤害 = 该子弹伤害 × 2）', '弹射触发 ×2', ''),
    ('弹射', 25, '弹射追踪', 2, 'rare', '弹射后子弹获得追踪', '弹射触发', ''),
    ('弹射', 26, '弹射回响', 1, 'common', '弹射时玩家回 1 水晶', '弹射触发', ''),
    ('弹射', 27, '节拍器', 1, 'common', '连击≥2：本次子弹+1', '条件子弹', ''),
    ('弹射', 28, '连击爆发', 1, 'rare', '连击≥10：清空连击 + 立刻发射 5 颗奥术飞弹', 'combo 大招', ''),
    # —— 召唤流派 (14 张) ——
    ('召唤', 29, '召唤炮台', 2, 'common', '召唤 1 小炮台（每敌方回合 1 弹，HP 3）', '召唤物 价值 12', '继承玩家 buff'),
    ('召唤', 30, '召唤士兵', 1, 'common', '召唤 1 士兵（HP 5，移动慢，挡敌人）', '召唤物 价值 8', ''),
    ('召唤', 31, '召唤群体', 3, 'rare', '召唤 3 士兵', '3 个士兵', ''),
    ('召唤', 32, '召唤奥弹炮台', 3, 'epic', '召唤 1 炮台（每回合发 1 颗奥术飞弹）', '高级炮台', ''),
    ('召唤', 33, '召唤护盾兵', 2, 'common', '召唤 1 护盾兵（HP 8）', '高血肉盾', ''),
    ('召唤', 34, '召唤狙击塔', 3, 'epic', '召唤 1 狙击塔（每 2 回合 1 颗高伤弹，HP 6）', '狙击塔', ''),
    ('召唤', 35, '召唤无人机', 2, 'common', '召唤 1 飞行单位（每回合 1 弹，HP 3）', '飞行单位', ''),
    ('召唤', 36, '召唤弹射炮台', 2, 'rare', '召唤 1 炮台（其子弹弹射+3）', '炮台 + 弹射', ''),
    ('召唤', 37, '召唤增援', 2, 'rare', '接下来 3 敌方回合，每回合自动召唤 1 士兵', '持续召唤', ''),
    ('召唤', 38, '军团统帅', 3, 'legendary', '展露：本回合召唤的所有单位 HP+100% 攻+2，无视回合衰减', '展露 buff', ''),
    ('召唤', 39, '重整', 1, 'common', '治疗所有友方单位 +3 HP', '群体治疗', ''),
    ('召唤', 40, '护盾术', 1, 'common', '给最近友方单位 1 护盾（吸收 1 击）', '护盾', ''),
    ('召唤', 41, '双面间谍', 1, 'common', '使用：召唤 2 工兵 / 弃置：召唤 1 弓箭手（高伤远程）', '使用+弃置双效果', ''),
    ('召唤', 42, '战术撤退', 1, 'rare', '弃置：同时弃 2 张随机反面手牌 → 召唤 1 重型炮台', '弃置触发', ''),
    # —— 跨流派连携 (8 张) ——
    ('连携', 43, '战吼', 1, 'common', '获得 1 层连携', 'stacks +1', ''),
    ('连携', 44, '双吼', 2, 'common', '获得 2 层连携', 'stacks +2', ''),
    ('连携', 45, '战意激昂', 3, 'legendary', '获得 4 层连携', 'stacks +4', ''),
    ('连携', 46, '洗入号令', 2, 'rare', '展露：每当你洗入手牌，获得 1 层连携', '展露', ''),
    ('连携', 47, '弃牌号令', 1, 'rare', '弃置：获得 2 层连携', '弃置触发', ''),
    ('连携', 48, '完美协调', 1, 'epic', '被连携使用时，此卡消耗值视为 0', '连携配菜', ''),
    ('连携', 49, '奥能协奏', 2, 'common', '获得 1 层连携 + 洗入 1 张奥术飞弹', '混合', ''),
    ('连携', 50, '击杀号令', 2, 'rare', '展露：每当敌人死亡，获得 1 层连携', '展露 + 击杀触发', ''),
    # —— 火焰流派 (7 张) ——
    ('火焰', 51, '火焰子弹', 1, 'common', '使用：子弹命中敌人 +1 火焰', '1 火焰 × HitEnemy', ''),
    ('火焰', 52, '烈焰射击', 2, 'common', '使用：子弹命中敌人 +2 火焰', '2 火焰 × HitEnemy', ''),
    ('火焰', 53, '引爆', 2, 'rare', '引爆：所有敌人受 (火焰层数 × 2) 伤害并清空所有火焰', '清空 +伤害', ''),
    ('火焰', 54, '火焰奥弹', 2, 'rare', '本回合所有奥弹命中 +2 火焰', '本回合 buff + 与奥弹结合', ''),
    ('火焰', 55, '火焰炮台', 2, 'rare', '召唤 1 炮台（子弹命中敌人 +2 火焰）', '与召唤结合', ''),
    ('火焰', 56, '凤凰', 3, 'legendary', '展露：每个玩家回合开始所有敌人 +1 火焰', '展露 + 全体 debuff', ''),
    ('火焰', 57, '熔岩', 3, 'epic', '所有敌人 +3 火焰', '全体 +3', ''),
    # —— 穿透 / 波次（按价值模型新增） ——
    ('穿透', 58, '穿透弹', 1, 'common', '使用：穿透+2', '穿透 4×2=8', ''),
    ('穿透', 59, '强穿透', 2, 'common', '使用：穿透+3、弹射+1', '12+2=14', ''),
    ('穿透', 60, '究极穿透', 3, 'rare', '使用：穿透+4、弹射+1', '16+2=18', ''),
    ('波次', 61, '多重射击', 2, 'common', '使用：波数+1、弹射+1', '12+2=14', ''),
    ('波次', 62, '弹幕', 3, 'rare', '使用：波数+1、子弹+1', '12+6=18', ''),
    ('波次', 63, '暴风弹幕', 3, 'epic', '使用：波数+2', '24（epic 略超模）', ''),
    # —— 调试卡（不在 Loot 池） ——
    ('调试', 64, '子弹波次+1', 1, 'common', '波数+1（初始 bag 9 张此卡用于平衡基线）', '12 价值', '不在 Loot 池'),
    # —— 衍生卡 ——
    ('衍生', 65, '奥术飞弹', 0, 'derived', '0 费。使用 / 展露 时立即发射 1 颗追踪奥弹（1 伤害），触发后销毁', '衍生卡', '由烟花/军备库/奥弹之雨/奥弹齐发等生成'),
]

header_row(cards_sheet, ['流派', '编号', '名称', '费用', '稀有度', '描述', '价值核算', '备注'])
for i, row in enumerate(CARDS, 2):
    for col, val in enumerate(row, 1):
        cards_sheet.cell(row=i, column=col, value=val)
style_data(cards_sheet, len(CARDS), 8)
# 列宽
widths = [10, 8, 14, 8, 12, 50, 35, 20]
for col, w in enumerate(widths, 1):
    cards_sheet.column_dimensions[chr(64 + col)].width = w
cards_sheet.row_dimensions[1].height = 24

# ============== 敌人 sheet ==============
enemies_sheet = wb.create_sheet('敌人')
ENEMIES = [
    # (Tier, name, hp, attack, speed, value, xpReward, shape, color, intent_desc)
    ('Tier 1', '哥布林', 8, 1, 90, 3, 2, '圆', '#7a8a4a', '接触造成 1 伤害，自爆'),
    ('Tier 1', '弓箭手', 3, 0, 40, 5, 3, '三角', '#a08060', '2 回合后射 1 颗弹（2 伤）'),
    ('Tier 1', '飞行兵', 5, 1, 130, 4, 3, '三角', '#4adcd0', '飞行接触 1 伤'),
    ('Tier 1', '突击兵', 7, 2, 180, 5, 4, '圆', '#ff5050', '高速冲刺 2 伤撞击'),
    ('Tier 2', '狙击手', 10, 0, 12, 7, 6, '三角', '#604070', '3 回合后高伤射击（5 伤）'),
    ('Tier 2', '弹射射手', 9, 0, 45, 6, 5, '圆', '#80d0d0', '2 回合后射弹射弹（弹 3）'),
    ('Tier 2', '追踪兵', 9, 0, 45, 6, 5, '圆', '#80a0d0', '2 回合后射追踪弹'),
    ('Tier 2', '治疗师', 10, 0, 40, 6, 5, '圆', '#60c060', '2 回合后治疗最近敌人 +3 HP'),
    ('Tier 2', '自爆球', 4, 6, 100, 5, 4, '圆', '#ffa040', '3 回合后自爆 6 伤 AOE'),
    ('Tier 2', '弹幕兵', 9, 0, 45, 7, 6, '圆', '#8080c0', '3 回合后 3 颗扇形弹（1 伤×3）'),
    ('Tier 3', '召唤师', 12, 0, 0, 9, 8, '方', '#702070', '3 回合后召唤 1 哥布林'),
    ('Tier 3', '指挥官', 11, 1, 45, 7, 7, '方', '#c08000', '2 回合后友军 +1 攻击'),
    ('Tier 3', '重甲兵', 25, 3, 35, 12, 9, '圆', '#444444', '接触造成 3 伤'),
    ('Tier 3', '法师', 8, 0, 28, 8, 7, '圆', '#a05ec0', '3 回合后 AOE 法术 3 伤'),
    ('Tier 3', '狂战士', 14, 2, 100, 9, 7, '圆', '#d04040', '1 回合后 +1 攻击（叠加），接触造成伤害'),
    ('Tier 3', '分裂者', 12, 0, 55, 6, 6, '圆', '#80c080', '接触 / 死亡分裂 2 个小型'),
    ('精英', '慢虫', 25, 1, 15, 8, 6, '方', '#a08040', '缓慢推进接触'),
    ('精英', '尖叫者', 7, 0, 40, 5, 5, '圆', '#c0a040', '3 回合后全敌人 +3 最大 HP'),
    ('精英', '时空法师', 11, 0, 45, 6, 6, '圆', '#6080c0', '2 回合后抽走玩家 1 法力'),
    ('Boss', '深渊魔王', 55, 4, 35, 25, 20, '圆', '#400040', '射 3 伤弹 / 召唤哥布林 / AOE 5 伤'),
    ('奖励', '金球', 999, 0, 0, 0, 0, '圆', '#ffd84a', '奖励目标。击中获得金币（指数递减）'),
]

header_row(enemies_sheet, ['等级', '名称', 'HP', '攻击', '速度', '价值费用', '经验奖励', '形状', '颜色', '行为描述'])
for i, row in enumerate(ENEMIES, 2):
    for col, val in enumerate(row, 1):
        enemies_sheet.cell(row=i, column=col, value=val)
# 敌人统一样式（无 tier 着色，等级作为文字列）
style_data(enemies_sheet, len(ENEMIES), 10)
widths_e = [8, 14, 6, 6, 6, 9, 9, 8, 12, 40]
for col, w in enumerate(widths_e, 1):
    enemies_sheet.column_dimensions[chr(64 + col)].width = w
enemies_sheet.row_dimensions[1].height = 24

# ============== 召唤物 sheet ==============
summons_sheet = wb.create_sheet('召唤物')
SUMMONS = [
    # (name, hp, attack, speed, bulletAttack, cooldown, decayRate, 描述)
    ('炮台', 3, 0, 0, 2, 1, 1, '固定炮台。每敌方回合射 1 颗子弹（继承玩家 buff）'),
    ('士兵', 5, 2, 60, '-', '-', 1, '近战推进。接触敌人造成 2 伤'),
    ('狙击塔', 6, 0, 0, 5, 2, 1, '高伤狙击。每 2 敌方回合射 5 伤弹'),
    ('护盾兵', 8, 2, 18, '-', '-', 1, '肉盾。缓慢推进 + 接触造成 2 伤'),
    ('无人机', 3, 0, '飞行', 1, 1, 1, '飞行单位。每敌方回合射 1 颗子弹'),
    ('奥弹炮台', 3, 0, 0, 2, 1, 1, '奥弹炮台。每敌方回合射 1 颗追踪奥弹'),
    ('弹射炮台', 3, 0, 0, 1, 1, 1, '炮台。子弹自带弹射 +3'),
    ('重型炮台', 7, 0, 0, 4, 1, 1, '高耐久炮台。每回合射 4 伤弹（战术撤退衍生）'),
    ('工兵', 3, 1, 95, '-', '-', 0, '快速近战。移速快、接触造成 1 伤、不衰减（双面间谍使用衍生）'),
    ('弓箭手', 4, 0, '-', 2, 1, 1, '远程弓兵。每敌方回合射 1 颗 2 伤箭（双面间谍弃置衍生）'),
]

header_row(summons_sheet, ['名称', 'HP', '攻击', '速度', '子弹伤害', '冷却(回合)', '回合衰减', '行为描述'])
for i, row in enumerate(SUMMONS, 2):
    for col, val in enumerate(row, 1):
        summons_sheet.cell(row=i, column=col, value=val)
style_data(summons_sheet, len(SUMMONS), 8)
widths_s = [14, 6, 6, 8, 10, 12, 10, 50]
for col, w in enumerate(widths_s, 1):
    summons_sheet.column_dimensions[chr(64 + col)].width = w
summons_sheet.row_dimensions[1].height = 24

# ============== 公式 sheet ==============
formulas_sheet = wb.create_sheet('公式')

def section(sheet, row, title):
    cell = sheet.cell(row=row, column=1, value=title)
    cell.font = Font(name=font_arial, bold=True, color='FFFFFF', size=12)
    cell.fill = HEADER_FILL
    cell.alignment = Alignment(horizontal='left', vertical='center')
    sheet.merge_cells(start_row=row, start_column=1, end_row=row, end_column=4)
    return row + 1

r = 1
# —— 1. 波次价值公式 ——
r = section(formulas_sheet, r, '1. 波次价值公式（每波 spawn 的"总价值"）')
formulas_sheet.cell(row=r, column=1, value='公式').font = bold
formulas_sheet.cell(row=r, column=2, value='value(w) = floor(8 + 3w + 0.3w²)').font = normal
formulas_sheet.merge_cells(start_row=r, start_column=2, end_row=r, end_column=4)
r += 1
formulas_sheet.cell(row=r, column=1, value='波次 w').font = bold
formulas_sheet.cell(row=r, column=2, value='价值 (公式)').font = bold
formulas_sheet.cell(row=r, column=3, value='价值 (实际)').font = bold
formulas_sheet.cell(row=r, column=4, value='说明').font = bold
r += 1
for w_idx in range(11):
    formulas_sheet.cell(row=r, column=1, value=w_idx).font = normal
    formulas_sheet.cell(row=r, column=2, value=f'8 + 3×{w_idx} + 0.3×{w_idx}²').font = normal
    formulas_sheet.cell(row=r, column=3, value=int(8 + 3 * w_idx + 0.3 * w_idx * w_idx)).font = normal
    if w_idx == 0:
        formulas_sheet.cell(row=r, column=4, value='第 1 波（开战即生成）').font = normal
    r += 1
r += 1

# —— 2. 波次间隔（按 shopLevel） ——
r = section(formulas_sheet, r, '2. 波次间隔（按 shopLevel 决定每多少回合 spawn 一波）')
formulas_sheet.cell(row=r, column=1, value='shopLevel').font = bold
formulas_sheet.cell(row=r, column=2, value='间隔 m (回合)').font = bold
formulas_sheet.cell(row=r, column=3, value='候选数').font = bold
formulas_sheet.cell(row=r, column=4, value='说明').font = bold
r += 1
intervals = [5, 5, 4, 4, 3, 3, 3, 2]
for lv in range(1, 9):
    formulas_sheet.cell(row=r, column=1, value=lv).font = normal
    formulas_sheet.cell(row=r, column=2, value=intervals[lv - 1]).font = normal
    formulas_sheet.cell(row=r, column=3, value=min(8, 2 + lv)).font = normal
    if lv == 1: formulas_sheet.cell(row=r, column=4, value='初始等级').font = normal
    if lv == 8: formulas_sheet.cell(row=r, column=4, value='最高等级').font = normal
    r += 1
r += 1

# —— 3. XP 升级曲线 ——
r = section(formulas_sheet, r, '3. XP 升级曲线（min(100, floor(6 + 4(L-1) + 0.6(L-1)²))）')
formulas_sheet.cell(row=r, column=1, value='等级').font = bold
formulas_sheet.cell(row=r, column=2, value='升下一级所需 XP').font = bold
formulas_sheet.cell(row=r, column=3, value='累计 XP').font = bold
formulas_sheet.cell(row=r, column=4, value='说明').font = bold
r += 1
total_xp = 0
for lv in range(1, 16):
    need = min(100, int(6 + 4 * (lv - 1) + 0.6 * (lv - 1) * (lv - 1)))
    total_xp += need
    formulas_sheet.cell(row=r, column=1, value=lv).font = normal
    formulas_sheet.cell(row=r, column=2, value=need).font = normal
    formulas_sheet.cell(row=r, column=3, value=total_xp).font = normal
    if need == 100: formulas_sheet.cell(row=r, column=4, value='封顶').font = normal
    r += 1
r += 1

# —— 4. 敌人 HP 缩放 ——
r = section(formulas_sheet, r, '4. 敌人 HP 缩放（基础 HP × (1 + (玩家等级 - 1) × 0.08)）')
formulas_sheet.cell(row=r, column=1, value='玩家等级').font = bold
formulas_sheet.cell(row=r, column=2, value='HP 倍率').font = bold
formulas_sheet.cell(row=r, column=3, value='哥布林 HP (基础 8)').font = bold
formulas_sheet.cell(row=r, column=4, value='Boss HP (基础 55)').font = bold
r += 1
for lv in [1, 3, 5, 7, 10, 15, 20]:
    scale = 1 + (lv - 1) * 0.08
    formulas_sheet.cell(row=r, column=1, value=lv).font = normal
    formulas_sheet.cell(row=r, column=2, value=f'×{scale:.2f}').font = normal
    formulas_sheet.cell(row=r, column=3, value=int(8 * scale)).font = normal
    formulas_sheet.cell(row=r, column=4, value=int(55 * scale)).font = normal
    r += 1
r += 1

# —— 5. 金球金币奖励（指数递减） ——
r = section(formulas_sheet, r, '5. 金球金币奖励（gold = max(1, floor(damage / (5 + 累计伤害 × 0.1)))）')
formulas_sheet.cell(row=r, column=1, value='累计伤害').font = bold
formulas_sheet.cell(row=r, column=2, value='5 dmg → 金币').font = bold
formulas_sheet.cell(row=r, column=3, value='10 dmg → 金币').font = bold
formulas_sheet.cell(row=r, column=4, value='说明').font = bold
r += 1
for total in [0, 10, 20, 50, 100, 200]:
    g5 = max(1, int(5 / (5 + total * 0.1)))
    g10 = max(1, int(10 / (5 + total * 0.1)))
    formulas_sheet.cell(row=r, column=1, value=total).font = normal
    formulas_sheet.cell(row=r, column=2, value=g5).font = normal
    formulas_sheet.cell(row=r, column=3, value=g10).font = normal
    if total == 0: formulas_sheet.cell(row=r, column=4, value='初始：5 dmg=1 金').font = normal
    r += 1
r += 1

# —— 6. 刷新成本 + 商店升级 ——
r = section(formulas_sheet, r, '6. 商店成本（刷新随回合线性增长；升级按阈值）')
formulas_sheet.cell(row=r, column=1, value='项目').font = bold
formulas_sheet.cell(row=r, column=2, value='公式 / 表').font = bold
formulas_sheet.cell(row=r, column=3, value='示例').font = bold
formulas_sheet.cell(row=r, column=4, value='说明').font = bold
r += 1
formulas_sheet.cell(row=r, column=1, value='刷新成本').font = normal
formulas_sheet.cell(row=r, column=2, value='cost = 1 + refreshCount').font = normal
formulas_sheet.cell(row=r, column=3, value='1, 2, 3, 4, 5...').font = normal
formulas_sheet.cell(row=r, column=4, value='每次 Loot 重置 refreshCount=0').font = normal
r += 1
formulas_sheet.cell(row=r, column=1, value='额外购买').font = normal
formulas_sheet.cell(row=r, column=2, value='cost = 3 + 2 × (n - 1)').font = normal
formulas_sheet.cell(row=r, column=3, value='3, 5, 7, 9...').font = normal
formulas_sheet.cell(row=r, column=4, value='第 2 张起付费').font = normal
r += 1
formulas_sheet.cell(row=r, column=1, value='商店升级').font = normal
formulas_sheet.cell(row=r, column=2, value='SHOP_THRESHOLDS').font = normal
formulas_sheet.cell(row=r, column=3, value='Lv→Lv+1: 1/2/4/6/8/11/15 金').font = normal
formulas_sheet.cell(row=r, column=4, value='Lv 1→2 = 1 金；Lv 7→8 = 15 金').font = normal
r += 1
r += 1

# —— 7. 稀有度概率（按 shopLevel） ——
r = section(formulas_sheet, r, '7. 稀有度概率（按 shopLevel；RARITY_PROB）')
formulas_sheet.cell(row=r, column=1, value='shopLevel').font = bold
formulas_sheet.cell(row=r, column=2, value='⬜ Common').font = bold
formulas_sheet.cell(row=r, column=3, value='🟦 Rare').font = bold
formulas_sheet.cell(row=r, column=4, value='🟪 Epic / 🟧 Legendary').font = bold
r += 1
RARITY = [
    (1, '100%', '0%', '0% / 0%'),
    (2, '70%',  '30%','0% / 0%'),
    (3, '55%',  '35%','10% / 0%'),
    (4, '45%',  '33%','20% / 2%'),
    (5, '35%',  '35%','25% / 5%'),
    (6, '25%',  '35%','30% / 10%'),
    (7, '20%',  '30%','35% / 15%'),
    (8, '10%',  '30%','40% / 20%'),
]
for lv, c, ra, ep in RARITY:
    formulas_sheet.cell(row=r, column=1, value=lv).font = normal
    formulas_sheet.cell(row=r, column=2, value=c).font = normal
    formulas_sheet.cell(row=r, column=3, value=ra).font = normal
    formulas_sheet.cell(row=r, column=4, value=ep).font = normal
    r += 1
r += 1

# —— 8. 卡牌价值模型 ——
r = section(formulas_sheet, r, '8. 卡牌价值模型（按费用应提供的总价值）')
formulas_sheet.cell(row=r, column=1, value='费用').font = bold
formulas_sheet.cell(row=r, column=2, value='价值').font = bold
formulas_sheet.cell(row=r, column=3, value='效果').font = bold
formulas_sheet.cell(row=r, column=4, value='价值').font = bold
r += 1
COST_VALUE = [
    (0, 0, '子弹+1', 6),
    (1, 8, '子弹波数+1', 12),
    (2, 14, '弹射+1', 2),
    (3, 18, '穿透+1', 4),
]
for cost, v, eff, ev in COST_VALUE:
    formulas_sheet.cell(row=r, column=1, value=cost).font = normal
    formulas_sheet.cell(row=r, column=2, value=v).font = normal
    formulas_sheet.cell(row=r, column=3, value=eff).font = normal
    formulas_sheet.cell(row=r, column=4, value=ev).font = normal
    r += 1
r += 1
MORE_EFFECTS = [
    ('追踪', 4, '展露', '基础效果价值 × 3'),
    ('火焰+1', '约 6', '洗入', '每张 -7'),
    ('连击需求', '-6 -(0.5×额外要求)', '弃置触发', '-7'),
    ('召唤物', '8 ~ 25', '随机', '效果平均 -1'),
]
for a, b, c, d in MORE_EFFECTS:
    formulas_sheet.cell(row=r, column=1, value=a).font = normal
    formulas_sheet.cell(row=r, column=2, value=b).font = normal
    formulas_sheet.cell(row=r, column=3, value=c).font = normal
    formulas_sheet.cell(row=r, column=4, value=d).font = normal
    r += 1

# 公式 sheet 整体样式
formulas_sheet.column_dimensions['A'].width = 22
formulas_sheet.column_dimensions['B'].width = 30
formulas_sheet.column_dimensions['C'].width = 30
formulas_sheet.column_dimensions['D'].width = 40
for row_idx in range(1, r):
    for c in range(1, 5):
        cell = formulas_sheet.cell(row=row_idx, column=c)
        if cell.value and not cell.font.bold:
            cell.alignment = Alignment(vertical='center', wrap_text=True)
            cell.border = thin_border

# 冻结首行
for sh in (cards_sheet, enemies_sheet, summons_sheet):
    sh.freeze_panes = 'A2'

wb.save('game_data.xlsx')
print('Saved game_data.xlsx')
print('Cards:', len(CARDS), 'Enemies:', len(ENEMIES), 'Summons:', len(SUMMONS))
