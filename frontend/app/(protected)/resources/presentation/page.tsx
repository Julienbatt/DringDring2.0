'use client'

import { useMemo, useState } from 'react'
import Image from 'next/image'
import { Download, Megaphone } from 'lucide-react'
import { toast } from 'sonner'
import { useAuth } from '@/app/(protected)/providers/AuthProvider'

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

const ROLE_COPY: Record<string, RoleCopy> = {
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
}

const MARKETING_DOSSIER_SECTIONS: Section[] = [
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
]

const MARKETING_KPI_SECTIONS: Section[] = [
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
]

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
  const role = user?.role ?? ''
  const roleCopy = ROLE_COPY[role] ?? ROLE_COPY.admin_region
  const isAdminRegion = role === 'admin_region'
  const [isGeneratingDossier, setIsGeneratingDossier] = useState(false)
  const [isGeneratingKpi, setIsGeneratingKpi] = useState(false)

  const sharedGuarantees = useMemo(
    () => [
      'Un service lisible pour chaque role (commune, shop, HQ, administration regionale).',
      'Des indicateurs actionnables, pas du reporting decoratif.',
      'Une execution terrain qui renforce la confiance des habitants et des partenaires.',
    ],
    []
  )

  const handleDossierPdf = async () => {
    try {
      setIsGeneratingDossier(true)
      await generatePdf(
        'DringDring_Kit_Marketing_Service.pdf',
        'DringDring - Kit marketing service',
        'Version demarchage communes, HQ et commerces',
        MARKETING_DOSSIER_SECTIONS
      )
      toast.success('PDF genere')
    } catch {
      toast.error('Generation PDF impossible')
    } finally {
      setIsGeneratingDossier(false)
    }
  }

  const handleKpiPdf = async () => {
    try {
      setIsGeneratingKpi(true)
      await generatePdf(
        'DringDring_Kit_Marketing_KPI.pdf',
        'DringDring - Scripts KPI de demarchage',
        'Formats de communication pour communes, HQ et commerces',
        MARKETING_KPI_SECTIONS
      )
      toast.success('PDF genere')
    } catch {
      toast.error('Generation PDF impossible')
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
              Pourquoi DringDring
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
        <h2 className="text-base font-semibold text-slate-900">Ce que DringDring garantit</h2>
        <div className="mt-3 space-y-2">
          {sharedGuarantees.map((line) => (
            <p key={line} className="text-sm text-slate-700">
              - {line}
            </p>
          ))}
        </div>
      </section>

      {isAdminRegion ? (
        <section className="rounded-2xl border border-emerald-200 bg-emerald-50/60 p-6">
          <h2 className="text-base font-semibold text-slate-900">Kit de demarchage (admin region)</h2>
          <p className="mt-1 text-sm text-slate-700">
            Outils marketing telechargeables pour convaincre de nouvelles communes, HQ et commerces.
          </p>
          <div className="mt-4 grid gap-3 md:grid-cols-2">
            <button
              type="button"
              onClick={handleDossierPdf}
              disabled={isGeneratingDossier}
              className="inline-flex items-center justify-center gap-2 rounded-full bg-emerald-600 px-4 py-2 text-xs font-semibold text-white hover:bg-emerald-700 disabled:cursor-not-allowed disabled:bg-emerald-300"
            >
              <Download className="h-4 w-4" />
              {isGeneratingDossier ? 'Generation...' : 'Telecharger dossier marketing'}
            </button>
            <button
              type="button"
              onClick={handleKpiPdf}
              disabled={isGeneratingKpi}
              className="inline-flex items-center justify-center gap-2 rounded-full bg-emerald-600 px-4 py-2 text-xs font-semibold text-white hover:bg-emerald-700 disabled:cursor-not-allowed disabled:bg-emerald-300"
            >
              <Download className="h-4 w-4" />
              {isGeneratingKpi ? 'Generation...' : 'Telecharger scripts KPI'}
            </button>
          </div>
        </section>
      ) : (
        <section className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-5">
          <p className="text-sm text-slate-700">
            Le kit de demarchage PDF est reserve au role admin region.
          </p>
        </section>
      )}
    </div>
  )
}

