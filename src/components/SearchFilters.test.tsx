import { describe, it, expect, vi, beforeEach, beforeAll } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';

type FiltersState = { category: string | null; sortBy: string };

const mockCategories: Array<{ id: string; label: string; icon: () => null }> = [
    { id: 'science', label: 'Ciencia', icon: (): null => null },
    { id: 'art', label: 'Arte', icon: (): null => null },
    { id: 'tech', label: 'Tecnologia', icon: (): null => null },
];

let SearchFilters: typeof import('./SearchFilters').default;

beforeAll(async () => {
    vi.doMock('../data', () => ({
        CATEGORIES: mockCategories,
    }));

    const module = await import('./SearchFilters');
    SearchFilters = module.default;
});

describe('SearchFilters', () => {
    const defaultFilters: FiltersState = { category: null, sortBy: 'relevance' };
    const mockOnClose: () => void = vi.fn();
    const mockOnApply: (nextFilters: FiltersState) => void = vi.fn();

    beforeEach(() => {
        vi.clearAllMocks();
    });

    describe('Renderizado', () => {
        it('no renderiza nada cuando isOpen es false', () => {
            const { container } = render(
                <SearchFilters
                    isOpen={false}
                    onClose={mockOnClose}
                    filters={defaultFilters}
                    onApply={mockOnApply}
                />
            );

            expect(container.firstChild).toBeNull();
        });

        it('renderiza el panel cuando isOpen es true', () => {
            render(
                <SearchFilters
                    isOpen={true}
                    onClose={mockOnClose}
                    filters={defaultFilters}
                    onApply={mockOnApply}
                />
            );

            expect(screen.getByText('Filtros')).toBeInTheDocument();
        });

        it('renderiza todas las opciones de ordenamiento', () => {
            render(
                <SearchFilters
                    isOpen={true}
                    onClose={mockOnClose}
                    filters={defaultFilters}
                    onApply={mockOnApply}
                />
            );

            expect(screen.getByText('Relevancia')).toBeInTheDocument();
            expect(screen.getByText('M\u00E1s recientes')).toBeInTheDocument();
            expect(screen.getByText('M\u00E1s populares')).toBeInTheDocument();
            expect(screen.getByText('A-Z')).toBeInTheDocument();
        });

        it('renderiza las categorias', () => {
            render(
                <SearchFilters
                    isOpen={true}
                    onClose={mockOnClose}
                    filters={defaultFilters}
                    onApply={mockOnApply}
                />
            );

            expect(screen.getByText('Ciencia')).toBeInTheDocument();
            expect(screen.getByText('Arte')).toBeInTheDocument();
            expect(screen.getByText('Tecnologia')).toBeInTheDocument();
        });
    });

    describe('Interacciones', () => {
        it('llama onApply con nuevo sortBy al hacer click en opcion de orden', () => {
            render(
                <SearchFilters
                    isOpen={true}
                    onClose={mockOnClose}
                    filters={defaultFilters}
                    onApply={mockOnApply}
                />
            );

            fireEvent.click(screen.getByText('M\u00E1s recientes'));

            expect(mockOnApply).toHaveBeenCalledWith({
                category: null,
                sortBy: 'recent'
            });
        });

        it('llama onApply con categoria al seleccionar una', () => {
            render(
                <SearchFilters
                    isOpen={true}
                    onClose={mockOnClose}
                    filters={defaultFilters}
                    onApply={mockOnApply}
                />
            );

            fireEvent.click(screen.getByText('Ciencia'));

            expect(mockOnApply).toHaveBeenCalledWith({
                category: 'science',
                sortBy: 'relevance'
            });
        });

        it('deselecciona categoria si ya esta seleccionada', () => {
            render(
                <SearchFilters
                    isOpen={true}
                    onClose={mockOnClose}
                    filters={{ category: 'science', sortBy: 'relevance' }}
                    onApply={mockOnApply}
                />
            );

            fireEvent.click(screen.getByText('Ciencia'));

            expect(mockOnApply).toHaveBeenCalledWith({
                category: null,
                sortBy: 'relevance'
            });
        });

        it('limpia filtros al hacer click en Limpiar filtros', () => {
            render(
                <SearchFilters
                    isOpen={true}
                    onClose={mockOnClose}
                    filters={{ category: 'art', sortBy: 'popular' }}
                    onApply={mockOnApply}
                />
            );

            fireEvent.click(screen.getByText('Limpiar filtros'));

            expect(mockOnApply).toHaveBeenCalledWith({
                category: null,
                sortBy: 'relevance'
            });
        });

        it('llama onClose al hacer click en Ver resultados', () => {
            render(
                <SearchFilters
                    isOpen={true}
                    onClose={mockOnClose}
                    filters={defaultFilters}
                    onApply={mockOnApply}
                />
            );

            fireEvent.click(screen.getByText('Ver resultados'));

            expect(mockOnClose).toHaveBeenCalled();
        });

        it('llama onClose al hacer click en el backdrop', () => {
            const { container } = render(
                <SearchFilters
                    isOpen={true}
                    onClose={mockOnClose}
                    filters={defaultFilters}
                    onApply={mockOnApply}
                />
            );

            const backdrop = container.firstChild as HTMLElement;
            fireEvent.click(backdrop);

            expect(mockOnClose).toHaveBeenCalledTimes(1);
        });

        it('llama onClose al hacer click en el boton cerrar', () => {
            render(
                <SearchFilters
                    isOpen={true}
                    onClose={mockOnClose}
                    filters={defaultFilters}
                    onApply={mockOnApply}
                />
            );

            const header = screen.getByText('Filtros').parentElement as HTMLElement;
            const closeButton = within(header).getByRole('button');
            fireEvent.click(closeButton);

            expect(mockOnClose).toHaveBeenCalledTimes(1);
        });
    });
});
