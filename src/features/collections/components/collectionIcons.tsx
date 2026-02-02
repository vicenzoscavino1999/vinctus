import { BookOpen, FileText, Folder, Lightbulb, Music } from 'lucide-react';

export const COLLECTION_ICON_OPTIONS = [
  { value: 'folder', label: 'Carpeta', Icon: Folder },
  { value: 'book', label: 'Libro', Icon: BookOpen },
  { value: 'music', label: 'Musica', Icon: Music },
  { value: 'idea', label: 'Idea', Icon: Lightbulb },
  { value: 'notes', label: 'Notas', Icon: FileText },
];

export const getCollectionIcon = (value: string | null | undefined) => {
  return (
    COLLECTION_ICON_OPTIONS.find((option) => option.value === value) ?? COLLECTION_ICON_OPTIONS[0]
  );
};
