import Image from "next/image"

interface GalleryImage {
  id: string
  url: string
  alt: string
}

export function GalleryGrid({ images }: { images: GalleryImage[] }) {
  return (
    <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-4">
      {images.map((image) => (
        <div key={image.id} className="relative aspect-square overflow-hidden rounded-lg">
          <Image
            src={image.url}
            alt={image.alt}
            fill
            sizes="(max-width: 768px) 50vw, (max-width: 1024px) 33vw, 25vw"
            className="object-cover"
            unoptimized
          />
        </div>
      ))}
    </div>
  )
}
