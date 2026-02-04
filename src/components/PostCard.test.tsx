import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { ReactNode } from 'react';
import { render, screen } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import PostCard from '@/features/posts/components/PostCard';
import { AppStateProvider } from '../context';

// Mock useAuth to return null user (anonymous)
vi.mock('@/app/providers/AuthContext', async () => {
  const actual = await vi.importActual('@/app/providers/AuthContext');
  return {
    ...actual,
    useAuth: () => ({
      user: null,
      loading: false,
      error: null,
      phoneCodeSent: false,
      signInWithGoogle: vi.fn(),
      signInWithEmail: vi.fn(),
      signUpWithEmail: vi.fn(),
      sendPhoneCode: vi.fn(),
      verifyPhoneCode: vi.fn(),
      signOut: vi.fn(),
      clearError: vi.fn(),
      resetPhoneAuth: vi.fn(),
    }),
  };
});

vi.mock('@/features/groups/api', () => ({
  joinGroupWithSync: vi.fn(() => Promise.resolve()),
  leaveGroupWithSync: vi.fn(() => Promise.resolve()),
}));

vi.mock('@/features/posts/api', () => ({
  likePostWithSync: vi.fn(() => Promise.resolve()),
  unlikePostWithSync: vi.fn(() => Promise.resolve()),
  savePostWithSync: vi.fn(() => Promise.resolve()),
  unsavePostWithSync: vi.fn(() => Promise.resolve()),
}));

vi.mock('@/features/profile/api', () => ({
  saveCategoryWithSync: vi.fn(() => Promise.resolve()),
  unsaveCategoryWithSync: vi.fn(() => Promise.resolve()),
}));

// Wrapper con providers necesarios
const Wrapper = ({ children }: { children: ReactNode }) => (
  <BrowserRouter>
    <AppStateProvider>{children}</AppStateProvider>
  </BrowserRouter>
);

const mockPost = {
  id: '1',
  title: 'Test Post Title',
  content: 'This is the post content',
  author: 'John Doe',
  role: 'Tester',
  group: 'Test Group',
  categoryId: 'science',
  time: '1h',
  likes: 42,
  comments: 10,
  isExpert: false,
};

describe('PostCard', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
  });

  describe('Renderizado', () => {
    it('renderiza el titulo del post', () => {
      render(<PostCard post={mockPost} />, { wrapper: Wrapper });

      expect(screen.getByText('Test Post Title')).toBeInTheDocument();
    });

    it('renderiza el contenido del post', () => {
      render(<PostCard post={mockPost} />, { wrapper: Wrapper });

      expect(screen.getByText('This is the post content')).toBeInTheDocument();
    });

    it('renderiza el nombre del autor', () => {
      render(<PostCard post={mockPost} />, { wrapper: Wrapper });

      expect(screen.getByText('John Doe')).toBeInTheDocument();
    });

    it('renderiza el nombre del grupo', () => {
      render(<PostCard post={mockPost} />, { wrapper: Wrapper });

      expect(screen.getByText('Test Group')).toBeInTheDocument();
    });

    it('renderiza el contador de likes', () => {
      render(<PostCard post={mockPost} />, { wrapper: Wrapper });

      expect(screen.getByText('42')).toBeInTheDocument();
    });

    it('renderiza el contador de comentarios', () => {
      render(<PostCard post={mockPost} />, { wrapper: Wrapper });

      expect(screen.getByText('10')).toBeInTheDocument();
    });

    it('muestra la inicial del autor en el avatar', () => {
      render(<PostCard post={mockPost} />, { wrapper: Wrapper });

      expect(screen.getByText('J')).toBeInTheDocument();
    });

    it('tiene botones interactivos', () => {
      render(<PostCard post={mockPost} />, { wrapper: Wrapper });

      // Verificar que hay botones para like y comment
      const buttons = screen.getAllByRole('button');
      expect(buttons.length).toBeGreaterThanOrEqual(2);
    });
  });
});
