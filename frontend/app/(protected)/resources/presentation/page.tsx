'use client'

import { useState } from 'react'
import { Download, FileText } from 'lucide-react'
import { toast } from 'sonner'
import Image from 'next/image'

type Section = {
  title: string
  body: string[]
}

const SERVICE_SECTIONS: Section[] = [
  {
    title: 'Resume executif',
    body: [
      'DringDring connecte communes, commerces, HQ et coursiers dans un flux unique de livraison locale.',
      'Le service combine impact social, economie locale et reduction carbone avec un pilotage simple par KPI.',
    ],
  },
  {
    title: 'Valeur Ville',
    body: [
      'Soutien cible des publics prioritaires.',
      'Pilotage budgetaire clair avec facturation exportable.',
      'Indicateurs d impact social et environnemental lisibles pour les elus.',
    ],
  },
  {
    title: 'Valeur Shop',
    body: [
      'Creation de commandes rapide.',
      'Fidelisation client et augmentation de la recurrense.',
      'Reporting business mensuel reutilisable en interne.',
    ],
  },
  {
    title: 'Valeur HQ',
    body: [
      'Vue consolidee multi-commerces et multi-regions.',
      'Suivi budget/subvention/volume en un seul tableau.',
      'Exports PDF/CSV pour finance, direction et RSE.',
    ],
  },
]

const KPI_SCRIPT_SECTIONS: Section[] = [
  {
    title: 'Script KPI Ville',
    body: [
      'Livraisons, beneficiaires, commerces actifs, subvention communale, part CMS, rythme operationnel, impact CO2.',
      'Format court destine aux dossiers communaux et comites de pilotage.',
    ],
  },
  {
    title: 'Script KPI Shop',
    body: [
      'Livraisons, clients actifs, part CMS, panier moyen, evolution mensuelle.',
      'Format destine au reporting interne commerce et coordination HQ.',
    ],
  },
  {
    title: 'Script KPI HQ',
    body: [
      'Subvention HQ, volume traite, livraisons, subvention par livraison, couverture territoriale, impact vert.',
      'Format destine a la direction et aux instances de pilotage multi-sites.',
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

async function generatePresentationPdf(
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
  y += 110

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
    section.body.forEach((line) => {
      writeWrapped(`- ${line}`, 11, false)
    })
    y += 10
  })

  doc.save(filename)
}

export default function PresentationResourcesPage() {
  const [isGeneratingService, setIsGeneratingService] = useState(false)
  const [isGeneratingKpi, setIsGeneratingKpi] = useState(false)

  const handleServicePdf = async () => {
    try {
      setIsGeneratingService(true)
      await generatePresentationPdf(
        'DringDring_Dossier_Service.pdf',
        'Dossier de presentation DringDring',
        'Version plateforme - ville, shop et HQ',
        SERVICE_SECTIONS
      )
      toast.success('PDF genere')
    } catch {
      toast.error('Generation PDF impossible')
    } finally {
      setIsGeneratingService(false)
    }
  }

  const handleKpiPdf = async () => {
    try {
      setIsGeneratingKpi(true)
      await generatePresentationPdf(
        'DringDring_Scripts_KPI.pdf',
        'Scripts KPI prets a partager',
        'Formats standards ville, shop et HQ',
        KPI_SCRIPT_SECTIONS
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
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-slate-900">
              Dossier de presentation DringDring
            </h1>
            <p className="text-sm text-slate-600">
              Telecharge les PDF de presentation et scripts KPI avec branding DringDring.
            </p>
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

      <section className="grid gap-4 md:grid-cols-2">
        <article className="rounded-2xl border border-slate-200 bg-white p-5">
          <div className="flex items-center gap-2 text-slate-900">
            <FileText className="h-5 w-5 text-emerald-600" />
            <h2 className="text-base font-semibold">PDF dossier service</h2>
          </div>
          <p className="mt-2 text-sm text-slate-600">
            Vision, proposition de valeur, KPI de reference et trame de pitch institutionnelle.
          </p>
          <button
            type="button"
            onClick={handleServicePdf}
            disabled={isGeneratingService}
            className="mt-4 inline-flex items-center gap-2 rounded-full bg-emerald-600 px-4 py-2 text-xs font-semibold text-white hover:bg-emerald-700 disabled:cursor-not-allowed disabled:bg-emerald-300"
          >
            <Download className="h-4 w-4" />
            {isGeneratingService ? 'Generation...' : 'Telecharger PDF'}
          </button>
        </article>

        <article className="rounded-2xl border border-slate-200 bg-white p-5">
          <div className="flex items-center gap-2 text-slate-900">
            <FileText className="h-5 w-5 text-emerald-600" />
            <h2 className="text-base font-semibold">PDF scripts KPI</h2>
          </div>
          <p className="mt-2 text-sm text-slate-600">
            Scripts copy-ready pour communication Ville, Shop et HQ.
          </p>
          <button
            type="button"
            onClick={handleKpiPdf}
            disabled={isGeneratingKpi}
            className="mt-4 inline-flex items-center gap-2 rounded-full bg-emerald-600 px-4 py-2 text-xs font-semibold text-white hover:bg-emerald-700 disabled:cursor-not-allowed disabled:bg-emerald-300"
          >
            <Download className="h-4 w-4" />
            {isGeneratingKpi ? 'Generation...' : 'Telecharger PDF'}
          </button>
        </article>
      </section>
    </div>
  )
}
