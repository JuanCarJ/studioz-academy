import type { Metadata } from "next"

import { getGalleryItems } from "@/actions/editorial"
import { GalleryGrid } from "@/components/gallery/GalleryGrid"

export const metadata: Metadata = {
  title: "Galeria — Studio Z Academy",
  description:
    "Explora fotos de cursos, trabajos y momentos de comunidad de Studio Z.",
}

export default async function GaleriaPage() {
  const items = await getGalleryItems()

  const images = items.map((item) => ({
    id: item.id,
    url: item.image_url,
    alt: item.caption || `Galeria Studio Z ${item.category}`,
    caption: item.caption,
    category: item.category,
  }))

  return (
    <section className="container mx-auto space-y-10 px-4 py-16">
      <div className="max-w-3xl">
        <p className="text-xs uppercase tracking-[0.36em] text-primary">
          Galeria
        </p>
        <h1 className="mt-4 text-4xl font-bold tracking-tight sm:text-5xl">
          La energia, el oficio y la identidad de Studio Z en imagenes.
        </h1>
        <p className="mt-5 text-lg leading-8 text-muted-foreground">
          Aqui ves parte de lo que se vive dentro y alrededor de Studio Z:
          procesos, trabajos, comunidad, momentos de practica y piezas que
          hablan por si solas de nuestra forma de crear y enseñar.
        </p>
      </div>

      <GalleryGrid images={images} />
    </section>
  )
}
