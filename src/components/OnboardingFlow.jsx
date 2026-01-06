import { useState } from 'react';
import { ArrowRight, Check, Sparkles, Users, BookOpen } from 'lucide-react';
import { CATEGORIES } from '../data';

// Onboarding Flow Component
const OnboardingFlow = ({ onComplete }) => {
    const [step, setStep] = useState(0);
    const [selectedInterests, setSelectedInterests] = useState([]);
    const [selectedGroups, setSelectedGroups] = useState([]);

    // Sample groups for onboarding
    const SAMPLE_GROUPS = [
        { id: 1, name: 'Exploradores Cuánticos', members: 2340, icon: '⚛️' },
        { id: 2, name: 'Historia Viva', members: 1890, icon: '🏛️' },
        { id: 3, name: 'Jazz & Vinilos', members: 956, icon: '🎷' },
        { id: 4, name: 'Filosofía Contemporánea', members: 1234, icon: '🤔' },
    ];

    const toggleInterest = (catId) => {
        setSelectedInterests(prev =>
            prev.includes(catId) ? prev.filter(id => id !== catId) : [...prev, catId]
        );
    };

    const toggleGroup = (groupId) => {
        setSelectedGroups(prev =>
            prev.includes(groupId) ? prev.filter(id => id !== groupId) : [...prev, groupId]
        );
    };

    const handleComplete = () => {
        // Persist selections to localStorage
        localStorage.setItem('vinctus_interests', JSON.stringify(selectedInterests));
        localStorage.setItem('vinctus_groups', JSON.stringify(selectedGroups));
        localStorage.setItem('vinctus_onboarding_complete', 'true');
        onComplete();
    };

    const nextStep = () => {
        if (step < 2) {
            setStep(step + 1);
        } else {
            handleComplete();
        }
    };

    const canProceed = () => {
        if (step === 1) return selectedInterests.length >= 2;
        if (step === 2) return selectedGroups.length >= 1;
        return true;
    };

    return (
        <div className="fixed inset-0 bg-surface-base z-50 flex flex-col">
            {/* Progress dots */}
            <div className="flex justify-center gap-2 pt-8 pb-4">
                {[0, 1, 2].map(i => (
                    <div
                        key={i}
                        className={`w-2 h-2 rounded-full transition-all duration-300 ${i === step ? 'w-8 bg-brand-gold' : i < step ? 'bg-brand-gold/50' : 'bg-neutral-700'
                            }`}
                    />
                ))}
            </div>

            {/* Content */}
            <div className="flex-1 overflow-y-auto px-6 pb-32">
                {/* Step 0: Welcome */}
                {step === 0 && (
                    <div className="flex flex-col items-center justify-center min-h-[60vh] text-center animate-fade-up">
                        <div className="w-20 h-20 rounded-full bg-brand-gold/10 flex items-center justify-center mb-8">
                            <Sparkles size={40} className="text-brand-gold" />
                        </div>
                        <h1 className="text-display-sm font-display text-white mb-4">
                            Bienvenido a <span className="text-brand-gold">Vinctus</span>
                        </h1>
                        <p className="text-neutral-400 text-body-md max-w-sm mb-2">
                            Una red social basada en lo que realmente te apasiona.
                        </p>
                        <p className="text-neutral-500 text-body-sm max-w-xs">
                            Conecta con personas que comparten tus intereses más profundos.
                        </p>
                    </div>
                )}

                {/* Step 1: Select Interests */}
                {step === 1 && (
                    <div className="animate-fade-up">
                        <div className="text-center mb-8">
                            <div className="w-16 h-16 rounded-full bg-brand-gold/10 flex items-center justify-center mx-auto mb-6">
                                <BookOpen size={32} className="text-brand-gold" />
                            </div>
                            <h2 className="text-display-sm font-display text-white mb-2">
                                ¿Qué te apasiona?
                            </h2>
                            <p className="text-neutral-500 text-body-sm">
                                Selecciona al menos 2 intereses
                            </p>
                        </div>

                        <div className="grid grid-cols-2 gap-3 max-w-md mx-auto">
                            {CATEGORIES.map(cat => {
                                const isSelected = selectedInterests.includes(cat.id);
                                return (
                                    <button
                                        key={cat.id}
                                        onClick={() => toggleInterest(cat.id)}
                                        className={`p-4 rounded-xl border text-left transition-all duration-200 press-scale ${isSelected
                                                ? 'bg-brand-gold/10 border-brand-gold/50 shadow-glow-gold'
                                                : 'bg-surface-overlay border-neutral-800 hover:border-neutral-700'
                                            }`}
                                    >
                                        <div className={`${cat.color} mb-2`}>
                                            <cat.icon size={24} strokeWidth={1.5} />
                                        </div>
                                        <span className={`text-sm font-medium ${isSelected ? 'text-white' : 'text-neutral-300'}`}>
                                            {cat.label}
                                        </span>
                                        {isSelected && (
                                            <div className="absolute top-2 right-2">
                                                <Check size={16} className="text-brand-gold" />
                                            </div>
                                        )}
                                    </button>
                                );
                            })}
                        </div>

                        <p className="text-center text-neutral-600 text-xs mt-6">
                            {selectedInterests.length} de 2 mínimo seleccionados
                        </p>
                    </div>
                )}

                {/* Step 2: Join Groups */}
                {step === 2 && (
                    <div className="animate-fade-up">
                        <div className="text-center mb-8">
                            <div className="w-16 h-16 rounded-full bg-brand-gold/10 flex items-center justify-center mx-auto mb-6">
                                <Users size={32} className="text-brand-gold" />
                            </div>
                            <h2 className="text-display-sm font-display text-white mb-2">
                                Únete a tu primer grupo
                            </h2>
                            <p className="text-neutral-500 text-body-sm">
                                Selecciona al menos 1 grupo para empezar
                            </p>
                        </div>

                        <div className="space-y-3 max-w-md mx-auto">
                            {SAMPLE_GROUPS.map(group => {
                                const isSelected = selectedGroups.includes(group.id);
                                return (
                                    <button
                                        key={group.id}
                                        onClick={() => toggleGroup(group.id)}
                                        className={`w-full p-4 rounded-xl border flex items-center gap-4 transition-all duration-200 press-scale ${isSelected
                                                ? 'bg-brand-gold/10 border-brand-gold/50 shadow-glow-gold'
                                                : 'bg-surface-overlay border-neutral-800 hover:border-neutral-700'
                                            }`}
                                    >
                                        <span className="text-2xl">{group.icon}</span>
                                        <div className="flex-1 text-left">
                                            <p className={`font-medium ${isSelected ? 'text-white' : 'text-neutral-300'}`}>
                                                {group.name}
                                            </p>
                                            <p className="text-neutral-500 text-xs">
                                                {group.members.toLocaleString()} miembros
                                            </p>
                                        </div>
                                        <div className={`w-6 h-6 rounded-full border-2 flex items-center justify-center transition-all ${isSelected ? 'bg-brand-gold border-brand-gold' : 'border-neutral-600'
                                            }`}>
                                            {isSelected && <Check size={14} className="text-black" />}
                                        </div>
                                    </button>
                                );
                            })}
                        </div>
                    </div>
                )}
            </div>

            {/* Bottom CTA */}
            <div className="fixed bottom-0 left-0 right-0 p-6 bg-gradient-to-t from-surface-base via-surface-base to-transparent">
                <button
                    onClick={nextStep}
                    disabled={!canProceed()}
                    className={`w-full py-4 rounded-xl font-medium text-sm uppercase tracking-wider flex items-center justify-center gap-2 transition-all btn-premium ${canProceed()
                            ? 'bg-brand-gold text-black'
                            : 'bg-neutral-800 text-neutral-500 cursor-not-allowed'
                        }`}
                >
                    {step === 2 ? 'Comenzar' : 'Continuar'}
                    <ArrowRight size={18} />
                </button>

                {step > 0 && (
                    <button
                        onClick={() => setStep(step - 1)}
                        className="w-full mt-3 py-2 text-neutral-500 text-sm hover:text-white transition-colors"
                    >
                        Volver
                    </button>
                )}
            </div>
        </div>
    );
};

export default OnboardingFlow;
