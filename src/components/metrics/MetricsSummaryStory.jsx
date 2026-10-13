import React, { useMemo, useState } from 'react';
import {
  ArrowRight,
  ChevronDown,
  Clock,
  HandCoins,
  Lightbulb,
  ListChecks,
  Loader2,
  PieChart as PieIcon,
  ShoppingBag,
  TrendingDown,
  TrendingUp,
} from 'lucide-react';

import { formatCurrency, formatNumber } from '../../utils/helpers';
import { formatQuantityForType } from '../../utils/metricQuantities';
import {
  buildActionTasks,
  buildHighlights,
  buildMoneySplit,
  describeChange,
  describeProfitChange,
  formatMoneyShort,
  getPreviousLabel,
} from '../../utils/metricsStory';

const TASK_PREVIEW_ROWS = 10;

// Precio y costo de los productos por peso están por gramo: se muestran por kilo.
const formatUnitPrice = (value, productType) => (
  productType === 'weight' ? `${formatMoneyShort(Number(value || 0) * 1000)}/kg` : formatMoneyShort(value)
);

const ChangeChip = ({ change }) => {
  if (!change) return null;
  const Icon = change.tone === 'down' ? TrendingDown : TrendingUp;
  return (
    <span className={`metrics-story-change is-${change.tone}`}>
      {change.tone !== 'neutral' && <Icon size={13} aria-hidden="true" />}
      {change.text}
    </span>
  );
};

const MoneyBar = ({ split, compact = false }) => {
  // Con pérdida las partes suman más de 100: se reparten sobre el total para que entren.
  const total = Math.max(100, split.parts.reduce((sum, part) => sum + part.per100, 0));
  return (
    <span className={`metrics-story-bar ${compact ? 'is-compact' : ''}`} role="img" aria-label={split.parts.map((part) => `${part.label}: ${formatNumber(Math.round(part.per100))} de cada 100`).join(', ')}>
      {split.parts.map((part) => (
        <i key={part.key} style={{ width: `${(part.per100 / total) * 100}%`, background: part.color }} title={`${part.label}: $${formatNumber(Math.round(part.per100))} de cada $100`} />
      ))}
    </span>
  );
};

const getTaskRowInfo = (task, row, canViewProfit) => {
  const item = row.raw || {};
  switch (task.key) {
    case 'soldOut':
      return `vendió ${formatQuantityForType(item.soldQty, item.type)}`;
    case 'runningLow': {
      const days = Math.floor(item.daysOfStock);
      return `quedan ${formatQuantityForType(item.stock, item.type)} · ${days < 1 ? 'menos de 1 día' : `${formatNumber(days)} ${days === 1 ? 'día' : 'días'}`}`;
    }
    case 'belowCost':
      return `precio ${formatUnitPrice(item.price, item.product_type)} · costo ${formatUnitPrice(item.purchasePrice, item.product_type)}`;
    case 'unsold':
      return canViewProfit
        ? `${formatQuantityForType(item.stock, item.type)} · ${formatMoneyShort(item.capital)} parados`
        : formatQuantityForType(item.stock, item.type);
    case 'expiring':
      if (item.daysUntil < 0) return `venció hace ${formatNumber(Math.abs(item.daysUntil))} días`;
      if (item.daysUntil === 0) return 'vence hoy';
      return `vence en ${formatNumber(item.daysUntil)} ${item.daysUntil === 1 ? 'día' : 'días'}`;
    default:
      return '';
  }
};

const TaskList = ({ tasks, canViewProfit, sectionLabels, onOpenSection }) => {
  const [openTask, setOpenTask] = useState(null);
  if (!tasks.length) {
    return (
      <div className="metrics-story-empty">
        <Lightbulb size={16} aria-hidden="true" />
        <span>Nada urgente: no hay agotados que se vendan, ni precios bajo el costo, ni stock parado para mover.</span>
      </div>
    );
  }
  return (
    <ol className="metrics-story-tasks">
      {tasks.map((task, index) => {
        const isOpen = openTask === task.key;
        const sectionLabel = sectionLabels[task.section];
        return (
          <li key={task.key} className={`is-${task.tone} ${isOpen ? 'is-open' : ''}`}>
            <button type="button" className="metrics-story-task-head" onClick={() => setOpenTask(isOpen ? null : task.key)} aria-expanded={isOpen}>
              <b>{index + 1}</b>
              <span>
                <strong>{task.title}</strong>
                <small>{task.detail}</small>
              </span>
              <ChevronDown size={16} aria-hidden="true" />
            </button>
            {isOpen && (
              <div className="metrics-story-task-body">
                <p><em>¿Por qué?</em> {task.why}</p>
                {task.rows.length > 0 && (
                  <ul>
                    {task.rows.slice(0, TASK_PREVIEW_ROWS).map((row, rowIndex) => (
                      <li key={`${task.key}-${rowIndex}`}>
                        <span title={row.name}>{row.name}</span>
                        <small>{getTaskRowInfo(task, row, canViewProfit)}</small>
                      </li>
                    ))}
                  </ul>
                )}
                {sectionLabel && (
                  <button type="button" className="metrics-story-link" onClick={() => onOpenSection(task.section)}>
                    {task.rows.length > TASK_PREVIEW_ROWS ? `Ver los ${formatNumber(task.rows.length)} en ${sectionLabel}` : `Ir a ${sectionLabel}`}
                    <ArrowRight size={13} aria-hidden="true" />
                  </button>
                )}
              </div>
            )}
          </li>
        );
      })}
    </ol>
  );
};

export default function MetricsSummaryStory({
  metrics,
  inventory,
  canViewProfit,
  isHistoryLoading,
  hourlyPeak,
  periodLabel,
  sectionLabels,
  onOpenSection,
  businessResultNode,
}) {
  const [openCard, setOpenCard] = useState('tasks');
  const stats = metrics.current.stats;
  const business = stats.business;
  const revenue = Number(stats.revenue || 0);
  const previousLabel = getPreviousLabel(metrics.rangeDays || 1);
  const salesChange = describeChange(metrics.changes.revenue, previousLabel);
  const profitChange = describeProfitChange(
    business.businessProfit,
    metrics.previous?.stats?.business?.businessProfit,
    previousLabel,
    metrics.canComparePreviousRange,
  );
  const split = useMemo(() => buildMoneySplit(business), [business]);
  const tasks = useMemo(() => (isHistoryLoading ? [] : buildActionTasks({
    stockInsights: metrics.stockInsights,
    inventory,
    business,
    canViewProfit,
    expiring: metrics.stockStats.expiring,
  })), [isHistoryLoading, metrics.stockInsights, metrics.stockStats.expiring, inventory, business, canViewProfit]);
  const highlights = useMemo(() => buildHighlights({
    dailySeries: metrics.current.dailySeries,
    productStats: metrics.current.productStats,
    paymentStats: metrics.current.paymentStats,
    hourlyPeak,
    revenue,
  }), [metrics, hourlyPeak, revenue]);
  const starProduct = metrics.current.productStats[0] || null;
  const isLoss = business.businessProfit < 0;
  const profitPer100 = split ? Math.round(split.profitPer100) : 0;
  const untypedTask = tasks.find((task) => task.key === 'untypedExpenses');
  const firstAlert = tasks.find((task) => task.key !== 'untypedExpenses') || null;
  const visibleHighlights = highlights.filter((item) => sectionLabels[item.section]);

  const cards = canViewProfit
    ? [
        {
          id: 'sales',
          question: '¿Cuánto vendí?',
          icon: ShoppingBag,
          value: formatMoneyShort(revenue),
          sub: `${formatNumber(stats.salesCount)} ventas · ${formatMoneyShort(stats.averageTicket)} cada una en promedio`,
          change: salesChange,
        },
        {
          id: 'profit',
          question: '¿Cuánto gané?',
          icon: HandCoins,
          value: isLoss ? `Pérdida ${formatMoneyShort(business.businessProfit)}` : formatMoneyShort(business.businessProfit),
          tone: isLoss ? 'is-negative' : 'is-positive',
          sub: isLoss
            ? `Faltaron $${formatNumber(Math.round(split?.shortfallPer100 || 0))} por cada $100 vendidos`
            : `De cada $100 vendidos te quedaron $${formatNumber(profitPer100)}`,
          change: profitChange,
        },
        {
          id: 'money',
          question: '¿A dónde fue la plata?',
          icon: PieIcon,
          value: split ? <MoneyBar split={split} compact /> : '—',
          sub: split ? split.parts.map((part) => `${part.short} $${formatNumber(Math.round(part.per100))}`).join(' · ') : 'Sin ventas en el período',
          subTitle: 'de cada $100 vendidos',
        },
        {
          id: 'tasks',
          question: '¿Qué hago ahora?',
          icon: ListChecks,
          value: tasks.length ? `${formatNumber(tasks.length)} ${tasks.length === 1 ? 'tarea' : 'tareas'}` : 'Nada urgente',
          sub: tasks[0]?.title || 'Todo en orden por ahora',
        },
      ]
    : [
        {
          id: 'sales',
          question: '¿Cuánto vendí?',
          icon: ShoppingBag,
          value: formatMoneyShort(revenue),
          sub: `${formatNumber(stats.salesCount)} ventas · ${formatMoneyShort(stats.averageTicket)} cada una en promedio`,
          change: salesChange,
        },
        {
          id: 'star',
          question: '¿Qué se vende más?',
          icon: TrendingUp,
          value: starProduct?.name || '—',
          sub: starProduct ? `${formatQuantityForType(starProduct.qty, starProduct.type)} vendidos · ${formatMoneyShort(starProduct.revenue)}` : 'Sin ventas',
          isText: true,
        },
        {
          id: 'when',
          question: '¿Cuándo hay más gente?',
          icon: Clock,
          value: hourlyPeak?.salesCount ? hourlyPeak.label : '—',
          sub: highlights.find((item) => item.key === 'bestDay') ? `Mejor día: ${highlights.find((item) => item.key === 'bestDay').value}` : 'Sin ventas',
        },
        {
          id: 'tasks',
          question: '¿Qué hago ahora?',
          icon: ListChecks,
          value: tasks.length ? `${formatNumber(tasks.length)} ${tasks.length === 1 ? 'tarea' : 'tareas'}` : 'Nada urgente',
          sub: tasks[0]?.title || 'Todo en orden por ahora',
        },
      ];

  const renderExplanation = () => {
    if (openCard === 'tasks') {
      return (
        <>
          <h3>Para hacer, de lo más urgente a lo menos <small>Tocá cada una para ver la lista y por qué</small></h3>
          {isHistoryLoading
            ? <p className="metrics-story-muted">Las tareas aparecen cuando terminen de cargar todas las ventas.</p>
            : <TaskList tasks={tasks} canViewProfit={canViewProfit} sectionLabels={sectionLabels} onOpenSection={onOpenSection} />}
        </>
      );
    }
    if (openCard === 'sales') {
      const previousRevenue = Number(metrics.previous?.stats?.revenue || 0);
      return (
        <>
          <h3>Cómo se calcula lo vendido</h3>
          <p>Es la suma de todas las ventas entre <strong>{periodLabel}</strong>, sin las anuladas ni las de prueba.</p>
          <div className="metrics-story-math">
            <span><small>Vendido</small><strong>{formatCurrency(revenue)}</strong></span>
            <b>÷</b>
            <span><small>Ventas</small><strong>{formatNumber(stats.salesCount)}</strong></span>
            <b>=</b>
            <span className="is-key"><small>Promedio por venta</small><strong>{formatCurrency(stats.averageTicket)}</strong></span>
          </div>
          {metrics.canComparePreviousRange && (
            <p>En {previousLabel} se vendieron <strong>{formatCurrency(previousRevenue)}</strong>{salesChange ? <>: ahora es <strong>{salesChange.text}</strong>.</> : '.'}</p>
          )}
          {sectionLabels.sales && (
            <button type="button" className="metrics-story-link" onClick={() => onOpenSection('sales')}>
              Ver las ventas día por día <ArrowRight size={13} aria-hidden="true" />
            </button>
          )}
        </>
      );
    }
    if (openCard === 'profit') {
      return (
        <>
          <h3>Cómo se calcula la ganancia</h3>
          <p>De lo vendido se resta lo que costó esa mercadería, los sueldos y los gastos del local (alquiler, luz, contador…). Lo que queda es la ganancia del negocio.</p>
          {businessResultNode}
          {untypedTask && <p className="metrics-story-caution"><strong>Ojo:</strong> {untypedTask.detail}</p>}
          {sectionLabels.profit && (
            <button type="button" className="metrics-story-link" onClick={() => onOpenSection('profit')}>
              Ver el detalle de gastos <ArrowRight size={13} aria-hidden="true" />
            </button>
          )}
        </>
      );
    }
    if (openCard === 'money' && split) {
      return (
        <>
          <h3>De cada $100 que vendiste, a dónde fueron</h3>
          <ul className="metrics-story-split">
            {split.parts.map((part) => (
              <li key={part.key}>
                <i style={{ background: part.color }} aria-hidden="true" />
                <span>{part.label}</span>
                <span className="metrics-story-split-track"><em style={{ width: `${Math.min(100, part.per100)}%`, background: part.color }} /></span>
                <strong>${formatNumber(Math.round(part.per100))}</strong>
                <small>{formatMoneyShort(part.value)}</small>
              </li>
            ))}
          </ul>
          {split.shortfallPer100 > 0 && (
            <p className="metrics-story-caution">Los gastos superaron lo que dejó la venta: faltaron <strong>${formatNumber(Math.round(split.shortfallPer100))}</strong> por cada $100 ({formatMoneyShort(business.businessProfit)} en total).</p>
          )}
          <p className="metrics-story-muted">
            {business.merchandisePurchased > 0 && <>Este período se compraron <strong>{formatMoneyShort(business.merchandisePurchased)}</strong> de mercadería: lo que no se vendió quedó en el stock, no es plata perdida. </>}
            {business.withdrawals > 0 && <>Aparte salieron <strong>{formatMoneyShort(business.withdrawals)}</strong> en retiros y préstamos, que no son gastos del negocio.</>}
          </p>
        </>
      );
    }
    if (openCard === 'star' && starProduct) {
      return (
        <>
          <h3>Los que más se vendieron</h3>
          <ul className="metrics-story-split">
            {metrics.current.productStats.slice(0, 5).map((row) => (
              <li key={row.key} className="is-plain">
                <span title={row.name}>{row.name}</span>
                <strong>{formatQuantityForType(row.qty, row.type)}</strong>
                <small>{formatMoneyShort(row.revenue)}</small>
              </li>
            ))}
          </ul>
          {sectionLabels.products && (
            <button type="button" className="metrics-story-link" onClick={() => onOpenSection('products')}>
              Ver todos los productos <ArrowRight size={13} aria-hidden="true" />
            </button>
          )}
        </>
      );
    }
    if (openCard === 'when') {
      return (
        <>
          <h3>Cuándo se vende más</h3>
          <p>La hora con más ventas fue <strong>{hourlyPeak?.label || '—'}</strong>. Abajo está el gráfico de ventas por hora.</p>
          {sectionLabels.sales && (
            <button type="button" className="metrics-story-link" onClick={() => onOpenSection('sales')}>
              Ver ventas por día y por hora <ArrowRight size={13} aria-hidden="true" />
            </button>
          )}
        </>
      );
    }
    return null;
  };

  return (
    <div className="metrics-story">
      <section className="metrics-story-headline" aria-live="polite">
        <p className="metrics-story-eyebrow">{metrics.range.label} · {periodLabel}</p>
        {isHistoryLoading ? (
          <h2><Loader2 size={20} className="animate-spin" aria-hidden="true" /> Cargando todas las ventas del período… los números todavía van a cambiar.</h2>
        ) : (
          <>
            <h2>
              Vendiste <mark>{formatMoneyShort(revenue)}</mark> en {formatNumber(stats.salesCount)} ventas
              {salesChange && <>, <span className={`is-${salesChange.tone}`}>{salesChange.text}</span></>}.
            </h2>
            {canViewProfit && (
              <p>
                {isLoss
                  ? <>Esta vez no alcanzó: después de mercadería, sueldos y gastos <mark className="is-negative">faltaron {formatMoneyShort(Math.abs(business.businessProfit))}</mark>.</>
                  : <>Te quedó una ganancia de <mark className="is-positive">{formatMoneyShort(business.businessProfit)}</mark> después de mercadería, sueldos y gastos.</>}
                {business.withdrawals > 0 && <> Aparte salieron {formatMoneyShort(business.withdrawals)} en retiros y préstamos.</>}
                {untypedTask && <span className="metrics-story-caution-inline"> Ojo: hay {formatMoneyShort(business.byType.other)} en gastos sin tipo y la cuenta puede no ser exacta.</span>}
              </p>
            )}
            {firstAlert && (
              <p className={`metrics-story-alert is-${firstAlert.tone}`}>
                <button type="button" onClick={() => setOpenCard('tasks')}>{firstAlert.title} <ArrowRight size={13} aria-hidden="true" /></button>
              </p>
            )}
          </>
        )}
      </section>

      <div className={`metrics-story-cards ${isHistoryLoading ? 'is-loading' : ''}`} role="tablist" aria-label="Preguntas del período">
        {cards.map((card) => {
          const Icon = card.icon;
          const isOpen = openCard === card.id;
          return (
            <button
              key={card.id}
              type="button"
              role="tab"
              aria-selected={isOpen}
              className={`metrics-story-card ${isOpen ? 'is-open' : ''}`}
              onClick={() => setOpenCard(card.id)}
            >
              <span className="metrics-story-card-q"><Icon size={15} aria-hidden="true" />{card.question}</span>
              <strong className={`${card.tone || ''} ${card.isText ? 'is-text' : ''}`} title={typeof card.value === 'string' ? card.value : undefined}>{card.value}</strong>
              {card.subTitle && <small className="metrics-story-card-subtitle">{card.subTitle}</small>}
              <small>{card.sub}</small>
              <ChangeChip change={card.change} />
              <em>{isOpen ? 'Abierto abajo' : 'Tocá para ver cómo'} <ChevronDown size={12} aria-hidden="true" /></em>
            </button>
          );
        })}
      </div>

      <section className="metrics-story-explain" role="tabpanel">
        {renderExplanation()}
      </section>

      {visibleHighlights.length > 0 && !isHistoryLoading && (
        <section className="metrics-story-highlights" aria-label="Datos del período">
          <span className="metrics-story-highlights-title"><Lightbulb size={14} aria-hidden="true" /> Para saber</span>
          {visibleHighlights.map((item) => (
            <button key={item.key} type="button" onClick={() => onOpenSection(item.section)} title={`Ir a ${sectionLabels[item.section]}`}>
              <small>{item.label}</small>
              <strong title={item.value}>{item.value}</strong>
              <span>{item.detail}</span>
            </button>
          ))}
        </section>
      )}
    </div>
  );
}
