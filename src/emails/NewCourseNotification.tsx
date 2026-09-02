interface NewCourseNotificationProps {
  courseTitle: string
  courseDescription: string
  courseUrl: string
  preferencesUrl: string
  kind?: "course" | "lesson"
}

export function NewCourseNotification({
  courseTitle,
  courseDescription,
  courseUrl,
  preferencesUrl,
  kind = "course",
}: NewCourseNotificationProps) {
  return (
    <div>
      <h1>{kind === "lesson" ? "¡Nueva lección disponible!" : "¡Nuevo curso disponible!"}</h1>
      <h2>{courseTitle}</h2>
      <p>{courseDescription}</p>
      <a href={courseUrl}>{kind === "lesson" ? "Ver lección" : "Ver curso"}</a>
      <p>Tienes activadas las novedades de cursos por correo en tu perfil.</p>
      <a href={preferencesUrl}>Cambiar mis preferencias de correo</a>
    </div>
  )
}
