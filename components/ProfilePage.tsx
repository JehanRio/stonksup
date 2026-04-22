import React from 'react';

const reviewGoals = [
  {
    title: '定位市场核心矛盾',
    description: '识别主流热点、情绪周期和赚钱效应，先回答“钱今天主要赚在哪里”。',
  },
  {
    title: '制定次日交易计划',
    description: '提前定义买点、卖点、仓位和应急预案，避免盘中情绪化追涨杀跌。',
  },
  {
    title: '沉淀长期盘感',
    description: '通过日复一日的复盘，建立对板块、龙头和情绪切换节奏的熟悉度。',
  },
];

const reviewSteps = [
  {
    index: '01',
    title: '大盘与情绪分析',
    purpose: '先定仓位，再决定要不要出手。',
    inputs: ['指数位置与量能变化', '涨停/跌停家数', '连板高度与炸板率', '领涨与领跌板块'],
    outputs: ['市场周期判断：迷茫 / 发酵 / 高潮 / 退潮', '次日总仓位建议：轻仓 / 半仓 / 重仓'],
    execution: '先看指数和成交额，确认市场是否处于可操作区间；再看涨停、跌停、炸板率和连板高度，判断情绪是在修复、高潮还是退潮。',
  },
  {
    index: '02',
    title: '分析热点板块',
    purpose: '先定方向，再去选股。',
    inputs: ['概念涨幅前 3', '涨幅榜个股所属行业高频词', '龙头/中军/补涨梯队', '政策、新闻、资金轮动'],
    outputs: ['主线板块 1-2 个', '观察板块 1-2 个', '板块持续性判断'],
    execution: '不要只看涨幅榜，要交叉验证“板块涨幅 + 个股归属 + 新闻催化”。重点判断是趋势主线、事件驱动，还是纯情绪一日游。',
  },
  {
    index: '03',
    title: '个股深度复盘',
    purpose: '从板块里定目标股，而不是临盘随便选。',
    inputs: ['涨停股原因与分时强度', '连板股与炸板股表现', '量价关系与图形突破', '自选股分类跟踪'],
    outputs: ['核心目标股', '观察备选股', '放弃名单'],
    execution: '优先看龙头、强趋势和图形突破股，再去看中军与补涨。炸板股也要复盘，因为它常常代表情绪分歧点和次日修复机会。',
  },
  {
    index: '04',
    title: '消息面与逻辑验证',
    purpose: '把“市场为什么涨”说清楚，避免只记走势不记逻辑。',
    inputs: ['行业新闻', '政策催化', '公告', '板块走势与消息的对应关系'],
    outputs: ['逻辑成立 / 存疑 / 证伪', '可继续跟踪的驱动因素'],
    execution: '把新闻和板块走势一一对应，回答“上涨逻辑是否真实存在、是否足够强、是否有持续发酵空间”。',
  },
  {
    index: '05',
    title: '制定交易计划',
    purpose: '盘前把动作写清楚，盘中只执行。',
    inputs: ['目标股优先级', '买入条件', '卖出纪律', '突发情况预案'],
    outputs: ['明日计划清单', '买卖触发条件', '应变剧本'],
    execution: '计划至少写清楚三件事：买什么、什么条件下买、什么情况下放弃。卖出也要提前定规则，比如冲高减仓、跌破均线止损、分歧转一致不追高。',
  },
  {
    index: '06',
    title: '每日复盘总结',
    purpose: '把经验沉淀为自己的体系，而不是只做记录。',
    inputs: ['今日执行得失', '计划与现实偏差', '错因复盘', '新的观察结论'],
    outputs: ['一条有效经验', '一条待修正错误', '次日重点观察项'],
    execution: '每天至少写下“今天做对了什么、做错了什么、下次怎么改”。长期积累后，复盘才会从记录升级为体系。',
  },
];

const executionTips = [
  '收盘后 30 分钟内先看市场数据，不急着看个股，先完成“定仓位、定方向”。',
  '把复盘拆成固定模板：大盘情绪 -> 板块 -> 个股 -> 消息 -> 计划 -> 总结，顺序不要乱。',
  '每一步都要求有输出，不只是“看了什么”，而是必须落到一句判断或一个动作。',
  '交易计划尽量写成触发式语言，例如“若高开不追，分时回踩承接后再看”；这样盘中更容易执行。',
  '每周再做一次周复盘，回看哪类模式最适合你，哪类错误重复出现最多。',
];

const dailyTemplate = [
  { label: '市场阶段', value: '发酵 / 高潮 / 退潮 / 修复' },
  { label: '总仓位建议', value: '轻仓 / 半仓 / 重仓' },
  { label: '主线板块', value: '记录 1-2 个最强方向' },
  { label: '核心目标股', value: '龙头 / 中军 / 补涨各写 1 个' },
  { label: '买入触发条件', value: '什么形态、什么时间、什么量能才出手' },
  { label: '卖出纪律', value: '止盈、止损、冲高减仓、跌破预期处理' },
  { label: '应变预案', value: '高开、低开、炸板、情绪转弱分别怎么处理' },
  { label: '今日反思', value: '今天最值得保留和最该修正的一件事' },
];

const ProfilePage: React.FC = () => {
  return (
    <div className="mx-auto max-w-[1360px] px-6 py-8">
      <div className="rounded-[32px] border border-slate-200 bg-[radial-gradient(circle_at_top_left,_rgba(59,130,246,0.10),_transparent_32%),linear-gradient(180deg,#ffffff_0%,#f8fafc_100%)] p-8 shadow-[0_30px_90px_-50px_rgba(15,23,42,0.35)]">
        <div className="flex flex-wrap items-end justify-between gap-6 border-b border-slate-200 pb-8">
          <div className="max-w-3xl">
            <div className="mb-3 inline-flex items-center rounded-full border border-blue-200 bg-blue-50 px-3 py-1 text-xs font-semibold text-blue-700">
              每日复盘工作台
            </div>
            <h1 className="text-3xl font-bold tracking-tight text-slate-900">你的六步复盘框架是对的，而且已经具备体系化雏形</h1>
            <p className="mt-3 text-sm leading-7 text-slate-500">
              这套方法的核心优点是顺序正确：先看市场和情绪，再定板块方向，再选个股，最后写交易计划。真正执行时，关键不是信息越多越好，而是每一步都要产出明确判断。
            </p>
          </div>

          <div className="grid min-w-[280px] grid-cols-1 gap-3 sm:grid-cols-3">
            {reviewGoals.map((goal) => (
              <div key={goal.title} className="rounded-2xl border border-slate-200 bg-white/80 p-4 shadow-sm">
                <h3 className="text-sm font-semibold text-slate-900">{goal.title}</h3>
                <p className="mt-2 text-xs leading-6 text-slate-500">{goal.description}</p>
              </div>
            ))}
          </div>
        </div>

        <div className="mt-8 grid grid-cols-1 gap-6 xl:grid-cols-[1.45fr_0.95fr]">
          <div className="space-y-5">
            {reviewSteps.map((step) => (
              <section key={step.index} className="rounded-[26px] border border-slate-200 bg-white/85 p-6 shadow-sm">
                <div className="flex flex-wrap items-start gap-4">
                  <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-slate-900 text-sm font-bold text-white">
                    {step.index}
                  </div>
                  <div className="flex-1">
                    <div className="flex flex-wrap items-center gap-3">
                      <h2 className="text-lg font-bold text-slate-900">{step.title}</h2>
                      <span className="rounded-full bg-slate-100 px-3 py-1 text-[11px] font-semibold text-slate-500">{step.purpose}</span>
                    </div>
                    <p className="mt-3 text-sm leading-7 text-slate-500">{step.execution}</p>

                    <div className="mt-5 grid grid-cols-1 gap-4 lg:grid-cols-2">
                      <div className="rounded-2xl bg-slate-50 p-4">
                        <div className="mb-3 text-xs font-bold uppercase tracking-[0.18em] text-slate-400">你要看什么</div>
                        <div className="space-y-2">
                          {step.inputs.map((item) => (
                            <div key={item} className="flex items-start gap-2 text-sm text-slate-600">
                              <span className="mt-1.5 h-1.5 w-1.5 rounded-full bg-blue-500"></span>
                              <span>{item}</span>
                            </div>
                          ))}
                        </div>
                      </div>

                      <div className="rounded-2xl bg-blue-50/70 p-4">
                        <div className="mb-3 text-xs font-bold uppercase tracking-[0.18em] text-blue-400">这一步输出什么</div>
                        <div className="space-y-2">
                          {step.outputs.map((item) => (
                            <div key={item} className="flex items-start gap-2 text-sm text-slate-700">
                              <span className="mt-1.5 h-1.5 w-1.5 rounded-full bg-blue-600"></span>
                              <span>{item}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </section>
            ))}
          </div>

          <aside className="space-y-5">
            <section className="rounded-[26px] border border-slate-200 bg-slate-900 p-6 text-white shadow-sm">
              <div className="text-xs font-bold uppercase tracking-[0.2em] text-blue-200">执行建议</div>
              <h2 className="mt-3 text-2xl font-bold">如果你问“该怎么执行”，重点是模板化和触发式</h2>
              <div className="mt-5 space-y-3">
                {executionTips.map((tip) => (
                  <div key={tip} className="rounded-2xl border border-white/10 bg-white/5 p-4 text-sm leading-7 text-slate-200">
                    {tip}
                  </div>
                ))}
              </div>
            </section>

            <section className="rounded-[26px] border border-slate-200 bg-white/85 p-6 shadow-sm">
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-xs font-bold uppercase tracking-[0.2em] text-slate-400">每日模板</div>
                  <h2 className="mt-2 text-xl font-bold text-slate-900">你每天至少要写完这 8 项</h2>
                </div>
                <div className="rounded-full bg-blue-50 px-3 py-1 text-[11px] font-semibold text-blue-600">盘后执行</div>
              </div>

              <div className="mt-5 space-y-3">
                {dailyTemplate.map((item) => (
                  <div key={item.label} className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                    <div className="text-sm font-semibold text-slate-800">{item.label}</div>
                    <div className="mt-1 text-xs leading-6 text-slate-500">{item.value}</div>
                  </div>
                ))}
              </div>
            </section>

            <section className="rounded-[26px] border border-emerald-200 bg-emerald-50/70 p-6 shadow-sm">
              <div className="text-xs font-bold uppercase tracking-[0.2em] text-emerald-500">结论</div>
              <p className="mt-3 text-sm leading-7 text-slate-700">
                你的六步骤是可以直接作为每日复盘主框架的。真正决定效果的，不是步骤数量，而是每一步有没有稳定输出。如果你愿意，下一步最值得做的是把这些条目继续做成“可填写表单 + 自动生成明日计划”的版本。
              </p>
            </section>
          </aside>
        </div>
      </div>
    </div>
  );
};

export default ProfilePage;
