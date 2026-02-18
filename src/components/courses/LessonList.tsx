"use client"

import { useState } from "react"

interface Lesson {
  id: string
  title: string
  durationSeconds: number
}

export function LessonList({
  lessons,
  activeLessonId,
  onSelect,
}: {
  lessons: Lesson[]
  activeLessonId?: string
  onSelect: (lessonId: string) => void
}) {
  const [activeId, setActiveId] = useState(activeLessonId)

  function handleSelect(lessonId: string) {
    setActiveId(lessonId)
    onSelect(lessonId)
  }

  return (
    <ul className="space-y-1">
      {lessons.map((lesson) => (
        <li key={lesson.id}>
          <button
            onClick={() => handleSelect(lesson.id)}
            className={`w-full rounded px-3 py-2 text-left text-sm transition-colors ${
              activeId === lesson.id
                ? "bg-primary text-primary-foreground"
                : "hover:bg-muted"
            }`}
          >
            {lesson.title}
          </button>
        </li>
      ))}
    </ul>
  )
}
