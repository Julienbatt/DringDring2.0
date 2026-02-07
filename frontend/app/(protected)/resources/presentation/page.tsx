'use client'

import { useState } from 'react'
import Image from 'next/image'
import { Download, Megaphone } from 'lucide-react'
import { toast } from 'sonner'
import { useAuth } from '@/app/(protected)/providers/AuthProvider'
import { useLanguage } from '@/lib/i18n/LanguageProvider'
import type { Locale } from '@/lib/i18n/messages'

type Section = {
  title: string
  body: string[]
}

type RoleCopy = {
  title: string
  intro: string
  points: string[]
  outro: string
}

type TranslationPack = {
  tagLabel: string
  pageTitle: string
  guaranteeTitle: string
  adminKitTitle: string
  adminKitIntro: string
  adminOnlyHint: string
  downloadDossierLabel: string
  downloadKpiLabel: string
  generatingLabel: string
  pdfOk: string
  pdfError: string
  roleCopy: Record<string, RoleCopy>
  sharedGuarantees: string[]
  dossierSections: Section[]
  kpiSections: Section[]
  dossierPdfTitle: string
  dossierPdfSubtitle: string
  dossierPdfFile: string
  kpiPdfTitle: string
  kpiPdfSubtitle: string
  kpiPdfFile: string
}

const TRANSLATIONS: Record<Locale, TranslationPack> = {
  fr: {
    tagLabel: 'Pourquoi DringDring',
    pageTitle: 'Votre service local, utile et mesurable',
    guaranteeTitle: 'Ce que DringDring garantit',
    adminKitTitle: 'Kit de demarchage (admin region)',
    adminKitIntro:
      'Outils marketing telechargeables pour convaincre de nouvelles communes, HQ et commerces.',
    adminOnlyHint: 'Le kit PDF de demarchage est reserve au role admin region.',
    downloadDossierLabel: 'Telecharger dossier marketing',
    downloadKpiLabel: 'Telecharger scripts KPI',
    generatingLabel: 'Generation...',
    pdfOk: 'PDF genere',
    pdfError: 'Generation PDF impossible',
    roleCopy: {
      city: {
        title: 'Votre commune rend service, avec dignite',
        intro:
          'Vous avez choisi DringDring pour soutenir les habitants qui en ont le plus besoin, sans complexifier le quotidien des services communaux.',
        points: [
          'Un service concret pour les publics prioritaires (CMS, mobilite reduite, personnes agees).',
          'Un pilotage simple: budget mobilise, volume de livraisons, impact local visible.',
          'Une communication positive: solidarite locale + economie de proximite + impact environnemental.',
        ],
        outro:
          'Votre choix montre qu une commune peut etre a la fois proche de ses habitants et rigoureuse sur ses resultats.',
      },
      shop: {
        title: 'Votre commerce reste proche de vos clients',
        intro:
          'Vous avez choisi DringDring pour continuer a servir vos clients, meme lorsqu ils ne peuvent pas se deplacer.',
        points: [
          'Des livraisons simples a creer, sans surcharge administrative.',
          'Un lien client renforce: plus de recurrence et plus de confiance.',
          'Un positionnement local fort: commerce utile, humain et moderne.',
        ],
        outro:
          'Vous transformez la livraison en service de fidelite et en avantage concurrentiel local.',
      },
      hq: {
        title: 'Votre groupe pilote performance et impact',
        intro:
          'Vous avez choisi DringDring pour coordonner plusieurs points de vente avec une lecture claire des volumes, des couts et de l impact.',
        points: [
          'Une vue consolidee multi-sites pour decision rapide.',
          'Des KPI fiables pour direction, finance et RSE.',
          'Un service qui aligne performance business et utilite territoriale.',
        ],
        outro:
          'Vous montrez qu un reseau peut etre performant, responsable et concretement utile sur le terrain.',
      },
      admin_region: {
        title: 'Vous orchestrez un service territorial utile',
        intro:
          'En tant qu administration regionale, vous donnez de la coherence au service: communes, commerces, HQ et coursiers travaillent enfin sur la meme base.',
        points: [
          'Pilotage unifie du dispatch, de la facturation et de la qualite de service.',
          'Vision claire des performances sociales, operationnelles et budgetaires.',
          'Capacite de demarchage plus forte avec un argumentaire structure et des preuves chiffrables.',
        ],
        outro:
          'Votre role est central: vous transformez une bonne idee en service public-operationnel durable.',
      },
    },
    sharedGuarantees: [
      'Un service lisible pour chaque role (commune, shop, HQ, administration regionale).',
      'Des indicateurs actionnables, pas du reporting decoratif.',
      'Une execution terrain qui renforce la confiance des habitants et des partenaires.',
    ],
    dossierSections: [
      {
        title: 'Pourquoi DringDring',
        body: [
          'DringDring relie communes, commerces, HQ et coursiers dans une operation unique.',
          'Le service combine impact social, economie locale et reduction carbone.',
          'Les resultats sont pilotables avec des KPI simples et partageables.',
        ],
      },
      {
        title: 'Valeur pour une commune',
        body: [
          'Soutenir les habitants fragiles avec une experience digne et fiable.',
          'Disposer d une lecture budgetaire claire sur chaque periode.',
          'Montrer des preuves d impact aupres des elus et des partenaires.',
        ],
      },
      {
        title: 'Valeur pour commerces et HQ',
        body: [
          'Augmenter la recurrence client et maintenir les achats dans le local.',
          'Consolider les chiffres en multi-sites pour pilotage direction.',
          'Disposer d exports exploitables pour finance et communication.',
        ],
      },
    ],
    kpiSections: [
      {
        title: 'Script KPI Commune',
        body: [
          'Livraisons, beneficiaires, commerces actifs, budget communal mobilise.',
          'Part CMS, rythme operationnel, impact environnemental local.',
        ],
      },
      {
        title: 'Script KPI Shop',
        body: [
          'Livraisons, clients actifs, nouveaux clients, panier moyen.',
          'Evolution mensuelle et contribution au service local.',
        ],
      },
      {
        title: 'Script KPI HQ',
        body: [
          'Subvention HQ, volume traite, livraisons et cout par livraison.',
          'Couverture territoriale et impact social/environnemental consolide.',
        ],
      },
    ],
    dossierPdfTitle: 'DringDring - Kit marketing service',
    dossierPdfSubtitle: 'Version demarchage communes, HQ et commerces',
    dossierPdfFile: 'DringDring_Kit_Marketing_Service_FR.pdf',
    kpiPdfTitle: 'DringDring - Scripts KPI de demarchage',
    kpiPdfSubtitle: 'Formats de communication pour communes, HQ et commerces',
    kpiPdfFile: 'DringDring_Kit_Marketing_KPI_FR.pdf',
  },
  de: {
    tagLabel: 'Warum DringDring',
    pageTitle: 'Ihr lokaler Service mit messbarer Wirkung',
    guaranteeTitle: 'Was DringDring garantiert',
    adminKitTitle: 'Akquise-Kit (Regional Admin)',
    adminKitIntro:
      'Downloadbare Marketing-Tools, um neue Gemeinden, HQs und Shops zu gewinnen.',
    adminOnlyHint: 'Das PDF-Akquise-Kit ist nur fuer die Rolle admin region verfuegbar.',
    downloadDossierLabel: 'Marketing Dossier herunterladen',
    downloadKpiLabel: 'KPI Skripte herunterladen',
    generatingLabel: 'Erstellung...',
    pdfOk: 'PDF erstellt',
    pdfError: 'PDF konnte nicht erstellt werden',
    roleCopy: {
      city: {
        title: 'Ihre Gemeinde hilft konkret und wuerdevoll',
        intro:
          'Sie haben DringDring gewaehlt, um Einwohner mit Bedarf zu unterstuetzen, ohne den Verwaltungsalltag zu verkomplizieren.',
        points: [
          'Konkreter Service fuer prioritaere Zielgruppen.',
          'Klare Steuerung: Budget, Lieferungen, lokaler Impact.',
          'Positive Kommunikation: soziale Naehe, lokale Wirtschaft, Klimaeffekt.',
        ],
        outro:
          'Ihre Entscheidung zeigt, dass eine Gemeinde menschlich und gleichzeitig ergebnisorientiert handeln kann.',
      },
      shop: {
        title: 'Ihr Shop bleibt nah an Ihren Kundinnen und Kunden',
        intro:
          'Mit DringDring bedienen Sie Ihre Kundschaft weiter, auch wenn sie nicht in den Laden kommen kann.',
        points: [
          'Schnelle Liefererfassung ohne Zusatzaufwand.',
          'Staerkere Kundenbindung und mehr Wiederkehr.',
          'Lokale Positionierung mit klarem Mehrwert.',
        ],
        outro:
          'Sie machen Lieferung zu einem echten Loyalitaets-Service.',
      },
      hq: {
        title: 'Ihr HQ steuert Leistung und Wirkung zentral',
        intro:
          'Mit DringDring koordinieren Sie mehrere Standorte mit klarer Sicht auf Volumen, Kosten und Wirkung.',
        points: [
          'Konsolidierte Multi-Site Sicht fuer schnelle Entscheidungen.',
          'Verlaessliche KPI fuer Management, Finance und ESG.',
          'Operative Effizienz und regionale Wirkung im selben System.',
        ],
        outro:
          'Sie zeigen: Ein Netzwerk kann leistungsstark und verantwortungsvoll sein.',
      },
      admin_region: {
        title: 'Sie orchestrieren einen wirksamen regionalen Service',
        intro:
          'Als Regional Admin schaffen Sie Koharenz: Gemeinden, Shops, HQ und Kuriere arbeiten auf einer gemeinsamen Basis.',
        points: [
          'Einheitliche Steuerung von Dispatch, Abrechnung und Servicequalitaet.',
          'Klare Sicht auf soziale, operative und finanzielle Leistung.',
          'Starkes Akquise-Argument mit strukturierten Nachweisen.',
        ],
        outro:
          'Ihre Rolle macht aus einer guten Idee einen stabilen regionalen Service.',
      },
    },
    sharedGuarantees: [
      'Verstaendlicher Service fuer jede Rolle (Gemeinde, Shop, HQ, Region Admin).',
      'KPI fuer Entscheidungen, nicht fuer Deko-Reporting.',
      'Zuverlaessige Ausfuehrung, die Vertrauen bei Einwohnern und Partnern schafft.',
    ],
    dossierSections: [
      {
        title: 'Warum DringDring',
        body: [
          'Eine Plattform fuer Gemeinden, Shops, HQ und Kuriere.',
          'Soziale Wirkung, lokale Wirtschaft und Klimaeffekt zusammen.',
          'Einfach steuerbar ueber klare KPI.',
        ],
      },
      {
        title: 'Nutzen fuer Gemeinden',
        body: [
          'Wuerdevoller Service fuer vulnerable Gruppen.',
          'Transparente Budgetsicht pro Periode.',
          'Konkrete Wirkungsnachweise fuer Politik und Partner.',
        ],
      },
      {
        title: 'Nutzen fuer Shops und HQ',
        body: [
          'Mehr Wiederkehr und lokale Kaufkraftbindung.',
          'Konsolidierte Zahlen fuer Managementsteuerung.',
          'Exportierbare Reports fuer Finance und Kommunikation.',
        ],
      },
    ],
    kpiSections: [
      { title: 'KPI Skript Gemeinde', body: ['Lieferungen, erreichte Personen, aktive Shops, Budget.', 'CMS Anteil, Betriebsrhythmus, lokaler Klimaeffekt.'] },
      { title: 'KPI Skript Shop', body: ['Lieferungen, aktive Kunden, Neukunden, Warenkorb.', 'Monatliche Entwicklung und lokaler Beitrag.'] },
      { title: 'KPI Skript HQ', body: ['HQ Subvention, Volumen, Lieferungen, Kosten pro Lieferung.', 'Gebietsabdeckung und konsolidierte Wirkung.'] },
    ],
    dossierPdfTitle: 'DringDring - Marketing Dossier',
    dossierPdfSubtitle: 'Version fuer Gemeinden, HQ und Shops',
    dossierPdfFile: 'DringDring_Marketing_Dossier_DE.pdf',
    kpiPdfTitle: 'DringDring - KPI Skripte',
    kpiPdfSubtitle: 'Kommunikationsformate fuer Gemeinden, HQ und Shops',
    kpiPdfFile: 'DringDring_Marketing_KPI_DE.pdf',
  },
  it: {
    tagLabel: 'Perche DringDring',
    pageTitle: 'Un servizio locale utile e misurabile',
    guaranteeTitle: 'Cosa garantisce DringDring',
    adminKitTitle: 'Kit commerciale (admin regionale)',
    adminKitIntro:
      'Strumenti marketing scaricabili per coinvolgere nuovi comuni, HQ e negozi.',
    adminOnlyHint: 'Il kit PDF commerciale e riservato al ruolo admin region.',
    downloadDossierLabel: 'Scarica dossier marketing',
    downloadKpiLabel: 'Scarica script KPI',
    generatingLabel: 'Generazione...',
    pdfOk: 'PDF generato',
    pdfError: 'Impossibile generare il PDF',
    roleCopy: {
      city: {
        title: 'Il vostro comune offre un servizio concreto e umano',
        intro:
          'Avete scelto DringDring per aiutare i cittadini piu fragili senza complicare il lavoro quotidiano degli uffici.',
        points: [
          'Supporto concreto per i pubblici prioritari.',
          'Controllo semplice di budget, volumi e impatto locale.',
          'Messaggio pubblico forte: solidarieta locale e utilita reale.',
        ],
        outro:
          'La vostra scelta dimostra che un comune puo essere vicino alle persone e rigoroso nei risultati.',
      },
      shop: {
        title: 'Il vostro negozio resta vicino ai clienti',
        intro:
          'Con DringDring continuate a servire i clienti anche quando non possono raggiungere il punto vendita.',
        points: [
          'Creazione consegne rapida e semplice.',
          'Migliore fidelizzazione e ritorno clienti.',
          'Posizionamento locale distintivo e utile.',
        ],
        outro:
          'Trasformate la consegna in un vero servizio di fidelizzazione.',
      },
      hq: {
        title: 'Il vostro HQ governa performance e impatto',
        intro:
          'Con DringDring coordinate piu sedi con una lettura chiara di volumi, costi e risultati.',
        points: [
          'Vista consolidata multi-sito.',
          'KPI affidabili per direzione, finance e sostenibilita.',
          'Performance operativa e impatto territoriale nello stesso flusso.',
        ],
        outro:
          'Dimostrate che una rete puo essere efficace e responsabile allo stesso tempo.',
      },
      admin_region: {
        title: 'Orchestrate un servizio territoriale di valore',
        intro:
          'Come admin regionale, allineate comuni, negozi, HQ e corrieri su una base operativa unica.',
        points: [
          'Controllo unificato di dispatch, fatturazione e qualita.',
          'Visione chiara di performance sociale, operativa e economica.',
          'Argomentario commerciale forte con prove misurabili.',
        ],
        outro:
          'Il vostro ruolo trasforma una buona idea in un servizio stabile sul territorio.',
      },
    },
    sharedGuarantees: [
      'Servizio chiaro per ogni ruolo (comune, shop, HQ, admin regionale).',
      'KPI utili alle decisioni, non solo report decorativi.',
      'Esecuzione affidabile che rafforza la fiducia di cittadini e partner.',
    ],
    dossierSections: [
      { title: 'Perche DringDring', body: ['Unifica comuni, shop, HQ e corrieri.', 'Impatto sociale, economia locale e ambiente insieme.', 'Governance semplice con KPI chiari.'] },
      { title: 'Valore per i comuni', body: ['Servizio dignitoso per pubblici fragili.', 'Lettura budget trasparente per periodo.', 'Prove di impatto per eletti e partner.'] },
      { title: 'Valore per shop e HQ', body: ['Piu fedelta e piu acquisti locali.', 'Numeri consolidati per la direzione.', 'Export pronti per finance e comunicazione.'] },
    ],
    kpiSections: [
      { title: 'Script KPI Comune', body: ['Consegne, beneficiari, shop attivi, budget.', 'Quota CMS, ritmo operativo, impatto ambientale locale.'] },
      { title: 'Script KPI Shop', body: ['Consegne, clienti attivi, nuovi clienti, scontrino medio.', 'Evoluzione mensile e contributo locale.'] },
      { title: 'Script KPI HQ', body: ['Subsidio HQ, volume, consegne, costo per consegna.', 'Copertura territoriale e impatto consolidato.'] },
    ],
    dossierPdfTitle: 'DringDring - Dossier Marketing',
    dossierPdfSubtitle: 'Versione per comuni, HQ e negozi',
    dossierPdfFile: 'DringDring_Dossier_Marketing_IT.pdf',
    kpiPdfTitle: 'DringDring - Script KPI',
    kpiPdfSubtitle: 'Formati comunicazione per comuni, HQ e negozi',
    kpiPdfFile: 'DringDring_Marketing_KPI_IT.pdf',
  },
  en: {
    tagLabel: 'Why DringDring',
    pageTitle: 'A local service with measurable impact',
    guaranteeTitle: 'What DringDring guarantees',
    adminKitTitle: 'Growth kit (regional admin)',
    adminKitIntro:
      'Downloadable marketing tools to onboard new cities, HQs and independent shops.',
    adminOnlyHint: 'The outreach PDF kit is limited to admin region role.',
    downloadDossierLabel: 'Download marketing dossier',
    downloadKpiLabel: 'Download KPI scripts',
    generatingLabel: 'Generating...',
    pdfOk: 'PDF generated',
    pdfError: 'PDF generation failed',
    roleCopy: {
      city: {
        title: 'Your city delivers help with dignity',
        intro:
          'You chose DringDring to support residents in need without adding administrative complexity.',
        points: [
          'A practical service for priority populations.',
          'Clear steering on budget, delivery volume and local impact.',
          'A positive public message: social proximity plus local economy.',
        ],
        outro:
          'Your decision proves a city can be both human and performance-driven.',
      },
      shop: {
        title: 'Your shop stays close to customers',
        intro:
          'With DringDring, you keep serving customers even when they cannot come to the store.',
        points: [
          'Fast order-to-delivery flow.',
          'Higher loyalty and repeat business.',
          'Strong local positioning with real utility.',
        ],
        outro:
          'You turn delivery into a true retention service.',
      },
      hq: {
        title: 'Your HQ manages performance and impact',
        intro:
          'With DringDring, you coordinate multiple sites with clear visibility on volume, cost and outcomes.',
        points: [
          'Consolidated multi-site visibility.',
          'Reliable KPIs for management, finance and ESG.',
          'Operational efficiency aligned with territorial impact.',
        ],
        outro:
          'You show that a network can be high-performing and responsible.',
      },
      admin_region: {
        title: 'You orchestrate a high-value regional service',
        intro:
          'As regional admin, you align cities, shops, HQ and couriers on one operational system.',
        points: [
          'Unified control of dispatch, billing and service quality.',
          'Clear view of social, operational and budget performance.',
          'Stronger outreach with structured messaging and evidence.',
        ],
        outro:
          'Your role turns a good idea into a durable regional service.',
      },
    },
    sharedGuarantees: [
      'A readable service for each role (city, shop, HQ, regional admin).',
      'KPIs designed for decisions, not decorative reporting.',
      'Reliable execution that builds trust with residents and partners.',
    ],
    dossierSections: [
      { title: 'Why DringDring', body: ['One flow for cities, shops, HQ and couriers.', 'Social impact, local economy and climate effect together.', 'Simple governance through clear KPIs.'] },
      { title: 'Value for cities', body: ['Dignified support for vulnerable residents.', 'Transparent budget view by period.', 'Evidence-ready outcomes for elected officials.'] },
      { title: 'Value for shops and HQ', body: ['More repeat customers and local retention.', 'Consolidated figures for management steering.', 'Export-ready outputs for finance and communications.'] },
    ],
    kpiSections: [
      { title: 'City KPI script', body: ['Deliveries, beneficiaries, active shops, mobilized budget.', 'CMS share, operating rhythm, local environmental impact.'] },
      { title: 'Shop KPI script', body: ['Deliveries, active customers, new customers, average basket.', 'Monthly trend and local business contribution.'] },
      { title: 'HQ KPI script', body: ['HQ subsidy, processed volume, deliveries, cost per delivery.', 'Territorial coverage and consolidated impact.'] },
    ],
    dossierPdfTitle: 'DringDring - Marketing Dossier',
    dossierPdfSubtitle: 'Outreach edition for cities, HQ and shops',
    dossierPdfFile: 'DringDring_Marketing_Dossier_EN.pdf',
    kpiPdfTitle: 'DringDring - KPI Outreach Scripts',
    kpiPdfSubtitle: 'Communication formats for cities, HQ and shops',
    kpiPdfFile: 'DringDring_Marketing_KPI_EN.pdf',
  },
}

async function loadLogoDataUrl(path: string) {
  const response = await fetch(path)
  if (!response.ok) return null
  const blob = await response.blob()
  return await new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onloadend = () => resolve(String(reader.result || ''))
    reader.onerror = reject
    reader.readAsDataURL(blob)
  })
}

async function generatePdf(
  filename: string,
  title: string,
  subtitle: string,
  sections: Section[]
) {
  const { jsPDF } = await import('jspdf')
  const doc = new jsPDF({ unit: 'pt', format: 'a4' })
  const pageWidth = doc.internal.pageSize.getWidth()
  const pageHeight = doc.internal.pageSize.getHeight()
  const margin = 50
  let y = 50

  const logoDataUrl = await loadLogoDataUrl('/brand/logo-Dring-Dring2.png')
  if (logoDataUrl) {
    doc.addImage(logoDataUrl, 'PNG', margin, y, 110, 34)
  }

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(20)
  doc.text(title, margin, y + 60)
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(11)
  doc.text(subtitle, margin, y + 80)
  y += 112

  const writeWrapped = (text: string, fontSize = 11, isBold = false) => {
    doc.setFont('helvetica', isBold ? 'bold' : 'normal')
    doc.setFontSize(fontSize)
    const lines = doc.splitTextToSize(text, pageWidth - margin * 2)
    for (const line of lines) {
      if (y > pageHeight - 60) {
        doc.addPage()
        y = 50
      }
      doc.text(line, margin, y)
      y += fontSize + 4
    }
  }

  sections.forEach((section) => {
    writeWrapped(section.title, 13, true)
    y += 2
    section.body.forEach((line) => writeWrapped(`- ${line}`))
    y += 10
  })

  doc.save(filename)
}

export default function PresentationResourcesPage() {
  const { user } = useAuth()
  const { locale } = useLanguage()
  const role = user?.role ?? ''
  const isAdminRegion = role === 'admin_region'
  const [isGeneratingDossier, setIsGeneratingDossier] = useState(false)
  const [isGeneratingKpi, setIsGeneratingKpi] = useState(false)

  const t = TRANSLATIONS[locale]
  const roleCopy = t.roleCopy[role] ?? t.roleCopy.admin_region

  const handleDossierPdf = async () => {
    try {
      setIsGeneratingDossier(true)
      await generatePdf(
        t.dossierPdfFile,
        t.dossierPdfTitle,
        t.dossierPdfSubtitle,
        t.dossierSections
      )
      toast.success(t.pdfOk)
    } catch {
      toast.error(t.pdfError)
    } finally {
      setIsGeneratingDossier(false)
    }
  }

  const handleKpiPdf = async () => {
    try {
      setIsGeneratingKpi(true)
      await generatePdf(t.kpiPdfFile, t.kpiPdfTitle, t.kpiPdfSubtitle, t.kpiSections)
      toast.success(t.pdfOk)
    } catch {
      toast.error(t.pdfError)
    } finally {
      setIsGeneratingKpi(false)
    }
  }

  return (
    <div className="p-8 space-y-6">
      <section className="rounded-2xl border border-slate-200 bg-white p-6">
        <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
          <div className="max-w-3xl space-y-3">
            <div className="inline-flex items-center gap-2 rounded-full bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700">
              <Megaphone className="h-3.5 w-3.5" />
              {t.tagLabel}
            </div>
            <h1 className="text-2xl font-bold tracking-tight text-slate-900">{roleCopy.title}</h1>
            <p className="text-sm text-slate-700">{roleCopy.intro}</p>
            <div className="space-y-2">
              {roleCopy.points.map((point) => (
                <p key={point} className="text-sm text-slate-700">
                  - {point}
                </p>
              ))}
            </div>
            <p className="text-sm font-medium text-slate-900">{roleCopy.outro}</p>
            <p className="text-xs text-slate-500">{t.pageTitle}</p>
          </div>
          <Image
            src="/brand/logo-Dring-Dring2.png"
            alt="Logo DringDring"
            width={180}
            height={56}
            className="h-12 w-auto object-contain"
          />
        </div>
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-6">
        <h2 className="text-base font-semibold text-slate-900">{t.guaranteeTitle}</h2>
        <div className="mt-3 space-y-2">
          {t.sharedGuarantees.map((line) => (
            <p key={line} className="text-sm text-slate-700">
              - {line}
            </p>
          ))}
        </div>
      </section>

      {isAdminRegion ? (
        <section className="rounded-2xl border border-emerald-200 bg-emerald-50/60 p-6">
          <h2 className="text-base font-semibold text-slate-900">{t.adminKitTitle}</h2>
          <p className="mt-1 text-sm text-slate-700">{t.adminKitIntro}</p>
          <div className="mt-4 grid gap-3 md:grid-cols-2">
            <button
              type="button"
              onClick={handleDossierPdf}
              disabled={isGeneratingDossier}
              className="inline-flex items-center justify-center gap-2 rounded-full bg-emerald-600 px-4 py-2 text-xs font-semibold text-white hover:bg-emerald-700 disabled:cursor-not-allowed disabled:bg-emerald-300"
            >
              <Download className="h-4 w-4" />
              {isGeneratingDossier ? t.generatingLabel : t.downloadDossierLabel}
            </button>
            <button
              type="button"
              onClick={handleKpiPdf}
              disabled={isGeneratingKpi}
              className="inline-flex items-center justify-center gap-2 rounded-full bg-emerald-600 px-4 py-2 text-xs font-semibold text-white hover:bg-emerald-700 disabled:cursor-not-allowed disabled:bg-emerald-300"
            >
              <Download className="h-4 w-4" />
              {isGeneratingKpi ? t.generatingLabel : t.downloadKpiLabel}
            </button>
          </div>
        </section>
      ) : (
        <section className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-5">
          <p className="text-sm text-slate-700">{t.adminOnlyHint}</p>
        </section>
      )}
    </div>
  )
}
