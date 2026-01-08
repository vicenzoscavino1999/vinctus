import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { Atom } from 'lucide-react';
import CategoryCard from './CategoryCard';
import type { Category } from '../types';

const mockCategory: Category = {
    id: 'science',
    label: 'Ciencia & Materia',
    description: 'La búsqueda de la verdad fundamental.',
    icon: Atom,
    color: 'text-blue-400',
    bgHover: 'hover:bg-blue-900/10',
    apiSource: 'arxiv',
    features: ['papers'],
    subgroups: [
        { id: 'physics', name: 'Física', members: '1k' },
        { id: 'chemistry', name: 'Química', members: '1k' },
    ],
    library: [],
};

describe('CategoryCard', () => {
    const mockOnClick = vi.fn();

    beforeEach(() => {
        vi.clearAllMocks();
    });

    describe('Renderizado', () => {
        it('renderiza el label de la categoria', () => {
            render(<CategoryCard category={mockCategory} onClick={mockOnClick} />);

            expect(screen.getByText('Ciencia & Materia')).toBeInTheDocument();
        });

        it('renderiza la descripcion', () => {
            render(<CategoryCard category={mockCategory} onClick={mockOnClick} />);

            expect(screen.getByText('La búsqueda de la verdad fundamental.')).toBeInTheDocument();
        });

        it('renderiza el icono de la categoria', () => {
            const { container } = render(<CategoryCard category={mockCategory} onClick={mockOnClick} />);

            expect(container.querySelector('svg')).toBeInTheDocument();
        });

        it('renderiza los subgrupos', () => {
            render(<CategoryCard category={mockCategory} onClick={mockOnClick} />);

            expect(screen.getByText(/Física/)).toBeInTheDocument();
            expect(screen.getByText(/Química/)).toBeInTheDocument();
        });
    });

    describe('Interacciones', () => {
        it('llama onClick al hacer click', () => {
            render(<CategoryCard category={mockCategory} onClick={mockOnClick} />);

            const card = screen.getByRole('button');
            fireEvent.click(card);

            expect(mockOnClick).toHaveBeenCalledTimes(1);
        });

        it('llama onClick al presionar Enter', () => {
            render(<CategoryCard category={mockCategory} onClick={mockOnClick} />);

            const card = screen.getByRole('button');
            fireEvent.keyDown(card, { key: 'Enter' });

            expect(mockOnClick).toHaveBeenCalledTimes(1);
        });

        it('llama onClick al presionar Space', () => {
            render(<CategoryCard category={mockCategory} onClick={mockOnClick} />);

            const card = screen.getByRole('button');
            fireEvent.keyDown(card, { key: ' ' });

            expect(mockOnClick).toHaveBeenCalledTimes(1);
        });
    });

    describe('Accesibilidad', () => {
        it('tiene role button', () => {
            render(<CategoryCard category={mockCategory} onClick={mockOnClick} />);

            expect(screen.getByRole('button')).toBeInTheDocument();
        });

        it('es focusable con tabIndex', () => {
            render(<CategoryCard category={mockCategory} onClick={mockOnClick} />);

            const card = screen.getByRole('button');
            expect(card).toHaveAttribute('tabIndex', '0');
        });
    });
});

