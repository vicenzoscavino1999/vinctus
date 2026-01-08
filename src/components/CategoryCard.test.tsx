import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import CategoryCard from './CategoryCard';

const mockCategory = {
    id: 'science',
    label: 'Ciencia & Materia',
    description: 'La busqueda de la verdad fundamental.',
    icon: () => <span data-testid="category-icon">Icon</span>,
    color: 'text-blue-400',
    bgHover: 'hover:bg-blue-900/10',
    subgroups: [
        { id: 'physics', name: 'Fisica' },
        { id: 'chemistry', name: 'Quimica' },
    ],
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

            expect(screen.getByText('La busqueda de la verdad fundamental.')).toBeInTheDocument();
        });

        it('renderiza el icono de la categoria', () => {
            render(<CategoryCard category={mockCategory} onClick={mockOnClick} />);

            expect(screen.getByTestId('category-icon')).toBeInTheDocument();
        });

        it('renderiza los subgrupos', () => {
            render(<CategoryCard category={mockCategory} onClick={mockOnClick} />);

            expect(screen.getByText(/Fisica/)).toBeInTheDocument();
            expect(screen.getByText(/Quimica/)).toBeInTheDocument();
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

