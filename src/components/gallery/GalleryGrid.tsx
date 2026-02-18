interface GalleryImage {
  id: string
  url: string
  alt: string
}

export function GalleryGrid({ images }: { images: GalleryImage[] }) {
  return (
    <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-4">
      {images.map((image) => (
        <div key={image.id} className="aspect-square overflow-hidden rounded-lg">
          <img
            src={image.url}
            alt={image.alt}
            className="h-full w-full object-cover"
          />
        </div>
      ))}
    </div>
  )
}
