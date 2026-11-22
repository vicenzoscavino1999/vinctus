import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { ToastProvider } from '@/shared/ui/Toast';
import CollectionsPanel from './CollectionsPanel';

const mockGetUserCollections = vi.fn();
const mockGetRecentCollectionItems = vi.fn();
const mockGetCollectionItems = vi.fn();
const mockCreateCollection = vi.fn();
const mockUpdateCollection = vi.fn();
const mockDeleteCollection = vi.fn();
const mockCreateCollectionItem = vi.fn();
const mockDeleteCollectionItem = vi.fn();
const mockUploadCollectionFile = vi.fn();
const mockDeleteCollectionFile = vi.fn();

let mockUser: { uid: string; displayName: string } | null = {
  uid: 'user_1',
  displayName: 'Alice',
};

vi.mock('@/context/auth', () => ({
  useAuth: () => ({ user: mockUser }),
}));

vi.mock('@/features/collections/api', () => ({
  getUserCollections: (...args: unknown[]) => mockGetUserCollections(...args),
  getRecentCollectionItems: (...args: unknown[]) => mockGetRecentCollectionItems(...args),
  getCollectionItems: (...args: unknown[]) => mockGetCollectionItems(...args),
  createCollection: (...args: unknown[]) => mockCreateCollection(...args),
  updateCollection: (...args: unknown[]) => mockUpdateCollection(...args),
  deleteCollection: (...args: unknown[]) => mockDeleteCollection(...args),
  createCollectionItem: (...args: unknown[]) => mockCreateCollectionItem(...args),
  deleteCollectionItem: (...args: unknown[]) => mockDeleteCollectionItem(...args),
}));

vi.mock('@/shared/lib/storage', () => ({
  uploadCollectionFile: (...args: unknown[]) => mockUploadCollectionFile(...args),
  deleteCollectionFile: (...args: unknown[]) => mockDeleteCollectionFile(...args),
}));

describe('Collections flows', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUser = { uid: 'user_1', displayName: 'Alice' };
  });

  it('recovers from load errors, filters accent-insensitively, and edits/deletes folders and items', async () => {
    const baseCollection = {
      id: 'col_music',
      name: 'Música Clásica',
      icon: 'music',
      itemCount: 1,
      createdAt: new Date('2026-01-10T00:00:00Z'),
      updatedAt: new Date('2026-01-10T00:00:00Z'),
    };
    const linkItem = {
      id: 'item_link',
      ownerId: 'user_1',
      collectionId: 'col_music',
      collectionName: 'Música Clásica',
      type: 'link' as const,
      title: 'Partitura Bach',
      url: 'https://example.com/bach',
      text: null,
      fileName: null,
      fileSize: null,
      contentType: null,
      storagePath: null,
      createdAt: new Date('2026-01-10T01:00:00Z'),
    };

    mockGetUserCollections
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValue([baseCollection]);
    mockGetRecentCollectionItems.mockResolvedValue([linkItem]);
    mockGetCollectionItems.mockResolvedValue([linkItem]);
    mockUpdateCollection.mockResolvedValue(undefined);
    mockDeleteCollectionItem.mockResolvedValue(undefined);
    mockDeleteCollection.mockResolvedValue(undefined);

    render(
      <ToastProvider>
        <CollectionsPanel />
      </ToastProvider>,
    );

    expect(await screen.findByText('No se pudieron cargar carpetas.')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Reintentar' }));
    expect(await screen.findByText('Música Clásica')).toBeInTheDocument();

    // Accent-insensitive search + clear
    const searchInput = screen.getByLabelText('Buscar en colecciones');
    fireEvent.change(searchInput, { target: { value: 'musica' } });
    expect(screen.getByText('Música Clásica')).toBeInTheDocument();
    fireEvent.click(screen.getByLabelText('Limpiar búsqueda'));
    expect(searchInput).toHaveValue('');

    // Open collection detail and verify link item has an external "Abrir" anchor
    fireEvent.click(screen.getByRole('button', { name: /^Música Clásica/i }));
    const openLink = await screen.findByRole('link', { name: /Abrir/i });
    expect(openLink).toHaveAttribute('href', 'https://example.com/bach');

    // Reject javascript: URL before calling API
    fireEvent.change(screen.getByLabelText(/Título/i), { target: { value: 'Malo' } });
    fireEvent.change(screen.getByLabelText(/Enlace/i), {
      target: { value: 'javascript:alert(1)' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Agregar' }));
    expect(
      await screen.findByText('Ingresa un enlace http:// o https:// válido.'),
    ).toBeInTheDocument();
    expect(mockCreateCollectionItem).not.toHaveBeenCalled();

    // Delete item with inline confirmation (no window.confirm)
    fireEvent.click(screen.getByLabelText('Eliminar Partitura Bach'));
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar' }));
    await waitFor(() => {
      expect(mockDeleteCollectionItem).toHaveBeenCalledWith('user_1', 'col_music', 'item_link');
    });

    // Edit folder metadata from detail modal
    fireEvent.click(screen.getByLabelText('Editar carpeta'));
    const nameInput = await screen.findByLabelText(/Nombre/i);
    fireEvent.change(nameInput, { target: { value: 'Música Barroca' } });
    fireEvent.click(screen.getByRole('button', { name: 'Guardar' }));
    await waitFor(() => {
      expect(mockUpdateCollection).toHaveBeenCalledWith('user_1', 'col_music', {
        name: 'Música Barroca',
        icon: 'music',
      });
    });

    // Delete folder via inline confirmation
    fireEvent.click(await screen.findByLabelText('Eliminar carpeta'));
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar eliminación' }));
    await waitFor(() => {
      expect(mockDeleteCollection).toHaveBeenCalledWith('user_1', 'col_music');
    });
  });

  it('rejects empty 0-byte files and cleans up Storage if Firestore item creation fails', async () => {
    const col = {
      id: 'col_files',
      name: 'Documentos',
      icon: 'folder',
      itemCount: 0,
      createdAt: new Date('2026-01-10T00:00:00Z'),
      updatedAt: new Date('2026-01-10T00:00:00Z'),
    };
    mockGetUserCollections.mockResolvedValue([col]);
    mockGetRecentCollectionItems.mockResolvedValue([]);
    mockGetCollectionItems.mockResolvedValue([]);
    mockUploadCollectionFile.mockResolvedValue({
      url: 'https://storage.example.com/paper.pdf',
      path: 'collections/user_1/col_files/item_x/paper.pdf',
      fileName: 'paper.pdf',
      contentType: 'application/pdf',
      size: 1024,
    });
    mockCreateCollectionItem.mockRejectedValueOnce(new Error('firestore failure'));
    mockDeleteCollectionFile.mockResolvedValue(undefined);

    render(
      <ToastProvider>
        <CollectionsPanel />
      </ToastProvider>,
    );

    fireEvent.click(await screen.findByRole('button', { name: /Documentos/i }));
    fireEvent.change(screen.getByLabelText('Tipo'), { target: { value: 'file' } });
    fireEvent.change(screen.getByLabelText(/Título/i), { target: { value: 'PDF Vacío' } });

    const fileInput = screen.getByLabelText(/Archivo/i);
    const emptyPdf = new File([], 'empty.pdf', { type: 'application/pdf' });
    fireEvent.change(fileInput, { target: { files: [emptyPdf] } });
    fireEvent.click(screen.getByRole('button', { name: 'Agregar' }));
    expect(await screen.findByText('El archivo está vacío.')).toBeInTheDocument();
    expect(mockUploadCollectionFile).not.toHaveBeenCalled();

    const validPdf = new File(['%PDF-1.4 content'], 'paper.pdf', { type: 'application/pdf' });
    fireEvent.change(fileInput, { target: { files: [validPdf] } });
    fireEvent.click(screen.getByRole('button', { name: 'Agregar' }));

    expect(await screen.findByText('No se pudo agregar el elemento.')).toBeInTheDocument();
    expect(mockDeleteCollectionFile).toHaveBeenCalledWith(
      'collections/user_1/col_files/item_x/paper.pdf',
    );
  });
});
