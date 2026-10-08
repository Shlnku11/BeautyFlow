import { useRef } from 'react';
import { Link } from 'react-router';
import { motion, useReducedMotion } from 'motion/react';
import { useGSAP } from '@gsap/react';
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faArrowRight, faBell, faCalendarDays, faChartLine, faClipboardCheck, faClock, faDisplay, faScissors, faShieldHalved, faUsers, faWallet } from '@fortawesome/free-solid-svg-icons';
import { Button } from '@/components/ui/button';
import { ru } from '@/shared/i18n/ru';
import { useSession } from '@/hooks/use-session';

gsap.registerPlugin(ScrollTrigger, useGSAP);

const featureIcons = [faCalendarDays, faClipboardCheck, faUsers, faWallet, faBell, faChartLine];
const benefitIcons = [faShieldHalved, faClock, faDisplay, faBell];

function DashboardPreview() {
  return <div aria-label="Предварительный вид календаря BeautyFlow" className="landing-preview" role="img">
    <div className="landing-preview-sidebar"><span className="landing-preview-mark">B</span><span className="landing-preview-brand">BeautyFlow</span><span className="landing-preview-nav active"><i/>Обзор</span><span className="landing-preview-nav"><i/>Календарь</span><span className="landing-preview-nav"><i/>Клиенты</span><span className="landing-preview-nav"><i/>Оплаты</span><span className="landing-preview-avatar">А</span></div>
    <div className="landing-preview-content">
      <div className="landing-preview-top"><div><span className="landing-preview-eyebrow">ПОНЕДЕЛЬНИК, 8 ОКТЯБРЯ</span><strong>Хорошего дня, Анна</strong></div><span className="landing-preview-action"><i/>Новая запись</span></div>
      <div className="landing-preview-metrics"><div><span>Записей сегодня</span><strong>12</strong><small>+2 к прошлой неделе</small></div><div><span>Выручка за месяц</span><strong>84 500 сом</strong><small>За последние 30 дней</small></div><div><span>Загрузка команды</span><strong>78%</strong><small>На этой неделе</small></div></div>
      <div className="landing-preview-calendar"><div className="landing-preview-calendar-head"><strong>Расписание на сегодня</strong><span>Все мастера⌄</span></div>
        <div className="landing-preview-row"><time>10:00</time><span className="landing-preview-event plum"><b>Маникюр · Анна К.</b><small>Алина · 60 мин</small></span><span className="landing-preview-event green"><b>Окрашивание · Мария Т.</b><small>София · 90 мин</small></span></div>
        <div className="landing-preview-row"><time>11:00</time><span className="landing-preview-event rose"><b>Уход · Елена С.</b><small>Мадина · 45 мин</small></span><span className="landing-preview-event empty"/></div>
        <div className="landing-preview-row"><time>12:00</time><span className="landing-preview-event empty"/><span className="landing-preview-event amber"><b>Стрижка · Дарья М.</b><small>София · 60 мин</small></span></div>
        <div className="landing-preview-row"><time>13:00</time><span className="landing-preview-event plum short"><b>Запись · 30 мин</b></span><span className="landing-preview-event empty"/></div>
      </div>
    </div>
    <div className="landing-preview-note"><span className="landing-preview-note-icon"><FontAwesomeIcon icon={faCalendarDays}/></span><span><b>Всё под контролем</b><small>Расписание команды в одном месте</small></span><span className="landing-preview-check">✓</span></div>
  </div>;
}

export function LandingPage() {
  const session = useSession();
  const root = useRef<HTMLElement>(null);
  const reducedMotion = useReducedMotion();
  const text = ru.landing;

  useGSAP(() => {
    const media = gsap.matchMedia();
    media.add('(min-width: 1024px) and (prefers-reduced-motion: no-preference)', () => {
      gsap.to('.landing-preview-wrap', {
        y: -20,
        ease: 'none',
        scrollTrigger: { trigger: '.landing-hero', start: 'top top', end: 'bottom top', scrub: 0.8 },
      });
    });
    return () => media.revert();
  }, { scope: root });

  const signedIn = Boolean(session.data);
  const appPath = session.data?.active.role === 'master' ? '/app/my-day' : '/app/dashboard';
  const primaryHref = signedIn ? appPath : '/register';

  return <main className="landing-page" ref={root}>
    <header className="landing-header">
      <nav aria-label={text.navLabel} className="landing-nav">
        <a aria-label={text.homeLabel} className="landing-brand" href="#top"><span className="landing-brand-mark">B</span><span>{text.eyebrow}</span></a>
        <div className="landing-links">{text.nav.map((label, index) => <a href={['#features', '#how-it-works', '#benefits', '#demo'][index]} key={label}>{label}</a>)}</div>
        <div className="landing-actions"><Link className="landing-login" to="/login">{text.login}</Link><Button asChild size="small" className="landing-button"><Link to={primaryHref}>{signedIn ? text.openApp : text.start}<FontAwesomeIcon aria-hidden="true" icon={faArrowRight}/></Link></Button></div>
      </nav>
    </header>

    <section className="landing-hero" id="top">
      <div className="landing-orbit landing-orbit-one"/><div className="landing-orbit landing-orbit-two"/>
      <div className="landing-hero-inner">
        <motion.div className="landing-copy" initial={reducedMotion ? false : { opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.55, ease: [0.2, 0.7, 0.2, 1] }}>
          <p className="landing-kicker"><span/>УПРАВЛЕНИЕ BEAUTY-БИЗНЕСОМ</p>
          <h1>{text.headline}</h1>
          <p className="landing-subheadline">{text.subheadline}</p>
          <div className="landing-hero-actions"><Button asChild className="landing-button landing-button-large"><Link to={primaryHref}>{signedIn ? text.openApp : text.start}<FontAwesomeIcon aria-hidden="true" icon={faArrowRight}/></Link></Button><Link className="landing-secondary-link" to="/login">{text.login}<span aria-hidden="true">↗</span></Link></div>
          <div className="landing-trust-row"><span><FontAwesomeIcon icon={faShieldHalved}/>Данные бизнеса защищены</span><span><FontAwesomeIcon icon={faClock}/>Запуск за пару минут</span></div>
        </motion.div>
        <div className="landing-preview-wrap"><DashboardPreview/></div>
        <div className="landing-scroll-cue"><span/>Листайте, чтобы узнать больше</div>
      </div>
    </section>

    <section className="landing-feature-section" id="features"><div className="landing-section-inner">
      <motion.div className="landing-section-heading" initial={reducedMotion ? false : { opacity: 0, y: 14 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, margin: '-70px' }} transition={{ duration: 0.45 }}><p className="landing-kicker">ЕДИНАЯ СИСТЕМА</p><h2>{text.featuresTitle}</h2></motion.div>
      <div className="landing-feature-grid">{text.features.map((feature, index) => <motion.article className="landing-feature-card" initial={reducedMotion ? false : { opacity: 0, y: 16 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, margin: '-50px' }} transition={{ duration: 0.4, delay: (index % 3) * 0.07 }} key={feature.title}><span className="landing-feature-icon"><FontAwesomeIcon aria-hidden="true" icon={featureIcons[index] ?? faScissors}/></span><h3>{feature.title}</h3><p>{feature.description}</p><span className="landing-feature-arrow" aria-hidden="true">↗</span></motion.article>)}</div>
    </div></section>

    <section className="landing-steps-section" id="how-it-works"><div className="landing-section-inner landing-steps-inner"><div className="landing-steps-intro"><p className="landing-kicker">БЕЗ СЛОЖНОГО ВНЕДРЕНИЯ</p><h2>{text.stepsTitle}</h2><p>Начните с расписания и постепенно подключайте остальные инструменты.</p></div><ol className="landing-steps">{text.steps.map((step, index) => <motion.li initial={reducedMotion ? false : { opacity: 0, x: 12 }} whileInView={{ opacity: 1, x: 0 }} viewport={{ once: true, margin: '-40px' }} transition={{ duration: 0.38, delay: index * 0.08 }} key={step.title}><span className="landing-step-number">0{index + 1}</span><div><h3>{step.title}</h3><p>{step.description}</p></div><span className="landing-step-line"/></motion.li>)}</ol></div></section>

    <section className="landing-demo-section" id="demo"><div className="landing-section-inner"><div className="landing-demo-heading"><div><p className="landing-kicker">ВАША СТУДИЯ В ОДНОМ ОКНЕ</p><h2>{text.demoTitle}</h2></div><Link className="landing-text-link" to={primaryHref}>{signedIn ? text.openApp : text.demoLink}<FontAwesomeIcon icon={faArrowRight}/></Link></div><div className="landing-demo-panel"><div className="landing-demo-copy"><span className="landing-demo-count">01 / 03</span><h3>Расписание, которое легко читать</h3><p>{text.calendarCaption}</p><ul><li>День команды на одном экране</li><li>Понятная загрузка специалистов</li><li>Быстрый переход к записи клиента</li></ul><Link to={primaryHref} className="landing-text-link">Посмотреть возможности <FontAwesomeIcon icon={faArrowRight}/></Link></div><div className="landing-demo-visual"><div className="landing-demo-window"><div className="landing-window-bar"><span/><span/><span/><i>BeautyFlow · Календарь</i></div><div className="landing-window-body"><div className="landing-window-days"><b>Время</b><span>ПН 08</span><span>ВТ 09</span><span>СР 10</span><span>ЧТ 11</span></div><div className="landing-window-line"><time>10:00</time><i/><b>Анна · Маникюр</b><span/><i/></div><div className="landing-window-line"><time>11:00</time><span/><i/><b>Мадина · Уход</b><i/><span/></div><div className="landing-window-line"><time>12:00</time><b>София · Стрижка</b><i/><span/><b>Анна · Окрашивание</b></div><div className="landing-window-line"><time>13:00</time><i/><span/><b>Мадина · Маникюр</b><span/><i/></div></div></div></div></div></div></section>

    <section className="landing-benefits-section" id="benefits"><div className="landing-section-inner"><div className="landing-section-heading"><p className="landing-kicker">ПРОДУМАНО ДЛЯ КОМАНДЫ</p><h2>{text.uniqueTitle}</h2></div><div className="landing-benefits-grid">{text.unique.map((item, index) => <article className="landing-benefit" key={item.title}><span className="landing-benefit-icon"><FontAwesomeIcon icon={benefitIcons[index] ?? faShieldHalved}/></span><div><h3>{item.title}</h3><p>{item.description}</p></div></article>)}</div></div></section>

    <section className="landing-cta-section"><div className="landing-cta-inner"><div><p className="landing-kicker">BEAUTYFLOW</p><h2>{text.ctaTitle}</h2><p>{text.ctaText}</p></div><Button asChild className="landing-button landing-button-light"><Link to={primaryHref}>{signedIn ? text.openApp : text.start}<FontAwesomeIcon icon={faArrowRight}/></Link></Button><div className="landing-cta-orb"/></div></section>

    <footer className="landing-footer"><div className="landing-section-inner"><div className="landing-footer-main"><a className="landing-brand" href="#top"><span className="landing-brand-mark">B</span><span>{text.eyebrow}</span></a><p>Порядок в расписании. Время для роста.</p>{text.footerGroups.map((group) => <section key={group.title}><h2>{group.title}</h2><ul>{group.links.map((item) => <li key={item.label}>{item.href.startsWith('#') ? <a href={item.href}>{item.label}</a> : <Link to={item.href}>{item.label}</Link>}</li>)}</ul></section>)}</div><div className="landing-footer-bottom"><span>© {new Date().getFullYear()} BeautyFlow</span><span>{text.footer}</span><a href="#top">Наверх ↑</a></div></div></footer>
  </main>;
}
