interface NewCourseNotificationProps {
  courseTitle: string
  courseDescription: string
  courseUrl: string
}

export function NewCourseNotification({
  courseTitle,
  courseDescription,
  courseUrl,
}: NewCourseNotificationProps) {
  return (
    <div>
      <h1>¡Nuevo curso disponible!</h1>
      <h2>{courseTitle}</h2>
      <p>{courseDescription}</p>
      <a href={courseUrl}>Ver curso</a>
    </div>
  )
}
