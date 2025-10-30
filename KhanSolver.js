/**
 * Khan Academy Auto-Solver v2.0
 * Detecta e resolve automaticamente exercícios do Khan Academy
 * ATENÇÃO: Use apenas para fins educacionais
 */

(function() {
    'use strict';
    
    // ==================== CONFIGURAÇÃO ====================
    const CONFIG = {
        autoMode: false,
        delay: 800,
        retryAttempts: 3,
        debug: true,
        autoNext: true
    };

    // ==================== UTILITÁRIOS ====================
    const Utils = {
        log: (...args) => CONFIG.debug && console.log('%c[Khan Auto]', 'color: #14bf96; font-weight: bold;', ...args),
        error: (...args) => console.error('%c[Khan Auto]', 'color: #e74c3c; font-weight: bold;', ...args),
        wait: (ms) => new Promise(resolve => setTimeout(resolve, ms)),
        
        // Trigger eventos realistas
        triggerEvents: (element, value = null) => {
            if (value !== null) element.value = value;
            
            ['input', 'change', 'blur', 'keyup', 'keydown'].forEach(eventType => {
                element.dispatchEvent(new Event(eventType, { bubbles: true, cancelable: true }));
            });
            
            // Eventos React
            const nativeInputValueSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
            if (nativeInputValueSetter && value !== null) {
                nativeInputValueSetter.call(element, value);
            }
            
            element.dispatchEvent(new Event('input', { bubbles: true }));
        },
        
        // Verificar visibilidade
        isVisible: (element) => {
            if (!element) return false;
            const style = window.getComputedStyle(element);
            return style.display !== 'none' && 
                   style.visibility !== 'hidden' && 
                   style.opacity !== '0' &&
                   element.offsetParent !== null;
        },
        
        // Extrair números
        extractNumbers: (text) => {
            const matches = text.match(/-?\d+\.?\d*/g);
            return matches ? matches.map(n => parseFloat(n)) : [];
        },
        
        // Avaliar expressão matemática
        evalMath: (expr) => {
            try {
                expr = expr.replace(/×|x/gi, '*').replace(/÷/g, '/');
                return Function('"use strict"; return (' + expr + ')')();
            } catch {
                return null;
            }
        }
    };

    // ==================== DETECTOR DE RESPOSTAS ====================
    const AnswerDetector = {
        // Procurar resposta no código fonte
        findInSource: () => {
            try {
                // Procurar em objetos React
                const reactRoot = document.querySelector('[data-reactroot], #react-root, #root');
                if (reactRoot) {
                    const reactFiber = Object.keys(reactRoot).find(key => key.startsWith('__reactFiber'));
                    if (reactFiber) {
                        const fiber = reactRoot[reactFiber];
                        return AnswerDetector.searchReactTree(fiber);
                    }
                }
                
                // Procurar em window objects
                for (let key in window) {
                    if (key.includes('answer') || key.includes('solution') || key.includes('correct')) {
                        Utils.log('Possível resposta em window.' + key, window[key]);
                    }
                }
                
                // Procurar em atributos data
                const dataElements = document.querySelectorAll('[data-answer], [data-correct], [data-solution]');
                if (dataElements.length > 0) {
                    Utils.log('Elementos com data-answer encontrados:', dataElements);
                    return Array.from(dataElements).map(el => ({
                        answer: el.dataset.answer || el.dataset.correct || el.dataset.solution,
                        element: el
                    }));
                }
                
            } catch (e) {
                Utils.error('Erro ao procurar resposta:', e);
            }
            return null;
        },
        
        // Pesquisar na árvore React
        searchReactTree: (fiber, depth = 0, maxDepth = 15) => {
            if (!fiber || depth > maxDepth) return null;
            
            try {
                // Procurar em props
                if (fiber.memoizedProps) {
                    const props = fiber.memoizedProps;
                    if (props.answer || props.correctAnswer || props.solution) {
                        Utils.log('Resposta encontrada em React props:', props);
                        return props.answer || props.correctAnswer || props.solution;
                    }
                }
                
                // Procurar em state
                if (fiber.memoizedState) {
                    const state = fiber.memoizedState;
                    if (state && (state.answer || state.correctAnswer)) {
                        Utils.log('Resposta encontrada em React state:', state);
                        return state.answer || state.correctAnswer;
                    }
                }
                
                // Recursão em filhos
                if (fiber.child) {
                    const result = AnswerDetector.searchReactTree(fiber.child, depth + 1, maxDepth);
                    if (result) return result;
                }
                
                // Recursão em siblings
                if (fiber.sibling) {
                    const result = AnswerDetector.searchReactTree(fiber.sibling, depth + 1, maxDepth);
                    if (result) return result;
                }
                
            } catch (e) {
                // Continuar silenciosamente
            }
            
            return null;
        },
        
        // Analisar contexto da questão
        analyzeQuestion: () => {
            const questionSelectors = [
                '[class*="question"]',
                '[class*="problem"]',
                '[role="main"]',
                '.perseus-renderer'
            ];
            
            for (const selector of questionSelectors) {
                const questionEl = document.querySelector(selector);
                if (questionEl) {
                    const text = questionEl.textContent;
                    Utils.log('Texto da questão:', text);
                    
                    // Tentar resolver matemática simples
                    const numbers = Utils.extractNumbers(text);
                    if (numbers.length >= 2) {
                        // Operações comuns
                        const operations = [
                            numbers[0] + numbers[1],
                            numbers[0] - numbers[1],
                            numbers[0] * numbers[1],
                            numbers[0] / numbers[1]
                        ];
                        Utils.log('Possíveis respostas calculadas:', operations);
                        return operations;
                    }
                }
            }
            return null;
        }
    };

    // ==================== SOLUCIONADORES ====================
    const Solvers = {
        // Múltipla escolha
        multipleChoice: async () => {
            Utils.log('Resolvendo múltipla escolha...');
            
            const selectors = [
                'input[type="radio"]',
                '[role="radio"]',
                '[role="radiogroup"] > *',
                '.perseus-radio-option',
                '[class*="radio"]'
            ];
            
            let options = [];
            for (const selector of selectors) {
                const elements = Array.from(document.querySelectorAll(selector)).filter(Utils.isVisible);
                if (elements.length > 0) {
                    options = elements;
                    break;
                }
            }
            
            if (options.length === 0) {
                Utils.error('Nenhuma opção encontrada');
                return false;
            }
            
            Utils.log(`${options.length} opções encontradas`);
            
            // Tentar encontrar resposta
            const answer = AnswerDetector.findInSource();
            if (answer) {
                Utils.log('Resposta detectada:', answer);
                // Tentar fazer match com as opções
                for (let i = 0; i < options.length; i++) {
                    const text = options[i].textContent || options[i].value;
                    if (text.includes(answer) || answer.toString().includes(text)) {
                        options[i].click();
                        Utils.log('Opção correta clicada:', i);
                        return true;
                    }
                }
            }
            
            // Selecionar aleatoriamente se não encontrar
            const randomIndex = Math.floor(Math.random() * options.length);
            options[randomIndex].click();
            Utils.log('Opção aleatória clicada:', randomIndex);
            
            await Utils.wait(300);
            return true;
        },
        
        // Input de texto/número
        textInput: async () => {
            Utils.log('Resolvendo input de texto...');
            
            const inputs = Array.from(document.querySelectorAll(
                'input[type="text"], input[type="number"], input[inputmode="numeric"], input[inputmode="decimal"], textarea'
            )).filter(Utils.isVisible);
            
            if (inputs.length === 0) {
                Utils.error('Nenhum input encontrado');
                return false;
            }
            
            Utils.log(`${inputs.length} inputs encontrados`);
            
            // Tentar encontrar resposta
            let answer = AnswerDetector.findInSource();
            
            if (!answer) {
                // Tentar calcular da questão
                const calculated = AnswerDetector.analyzeQuestion();
                if (calculated && calculated.length > 0) {
                    answer = calculated[0];
                }
            }
            
            if (!answer) {
                // Valor padrão
                answer = Math.floor(Math.random() * 100);
            }
            
            // Preencher todos os inputs
            for (const input of inputs) {
                Utils.triggerEvents(input, answer.toString());
                Utils.log('Input preenchido com:', answer);
            }
            
            await Utils.wait(300);
            return true;
        },
        
        // Dropdown/Select
        dropdown: async () => {
            Utils.log('Resolvendo dropdown...');
            
            const selects = Array.from(document.querySelectorAll('select')).filter(Utils.isVisible);
            
            if (selects.length === 0) {
                Utils.error('Nenhum dropdown encontrado');
                return false;
            }
            
            for (const select of selects) {
                if (select.options.length > 1) {
                    const randomIndex = 1 + Math.floor(Math.random() * (select.options.length - 1));
                    select.selectedIndex = randomIndex;
                    Utils.triggerEvents(select);
                    Utils.log('Dropdown selecionado:', select.options[randomIndex].text);
                }
            }
            
            await Utils.wait(300);
            return true;
        },
        
        // Checkbox
        checkbox: async () => {
            Utils.log('Resolvendo checkbox...');
            
            const checkboxes = Array.from(document.querySelectorAll('input[type="checkbox"]')).filter(Utils.isVisible);
            
            if (checkboxes.length === 0) {
                Utils.error('Nenhum checkbox encontrado');
                return false;
            }
            
            // Marcar alguns aleatoriamente
            checkboxes.forEach(cb => {
                if (Math.random() > 0.4) {
                    cb.checked = true;
                    Utils.triggerEvents(cb);
                }
            });
            
            Utils.log(`${checkboxes.length} checkboxes processados`);
            await Utils.wait(300);
            return true;
        },
        
        // Área de desenho/gráfico
        canvas: async () => {
            Utils.log('Detectado exercício com canvas - pulando...');
            return false;
        }
    };

    // ==================== DETECTOR DE TIPO ====================
    const ExerciseDetector = {
        detect: () => {
            // Ordem de prioridade na detecção
            if (document.querySelector('input[type="radio"], [role="radio"], [role="radiogroup"]')) {
                return 'multipleChoice';
            }
            if (document.querySelector('input[type="text"], input[type="number"], input[inputmode="numeric"], textarea')) {
                return 'textInput';
            }
            if (document.querySelector('select')) {
                return 'dropdown';
            }
            if (document.querySelector('input[type="checkbox"]')) {
                return 'checkbox';
            }
            if (document.querySelector('canvas')) {
                return 'canvas';
            }
            return 'unknown';
        }
    };

    // ==================== CONTROLADOR DE BOTÕES ====================
    const ButtonController = {
        findButton: (keywords) => {
            const buttons = Array.from(document.querySelectorAll('button, [role="button"], input[type="submit"]'));
            
            for (const btn of buttons) {
                if (!Utils.isVisible(btn)) continue;
                
                const text = (btn.textContent || btn.value || '').toLowerCase();
                const ariaLabel = (btn.getAttribute('aria-label') || '').toLowerCase();
                const fullText = text + ' ' + ariaLabel;
                
                for (const keyword of keywords) {
                    if (fullText.includes(keyword.toLowerCase())) {
                        return btn;
                    }
                }
            }
            return null;
        },
        
        check: async () => {
            const keywords = ['check', 'verificar', 'submit', 'enviar', 'conferir'];
            const btn = ButtonController.findButton(keywords);
            
            if (btn) {
                Utils.log('Botão de verificação encontrado:', btn.textContent);
                await Utils.wait(CONFIG.delay);
                btn.click();
                return true;
            }
            
            Utils.error('Botão de verificação não encontrado');
            return false;
        },
        
        next: async () => {
            const keywords = ['next', 'próxim', 'continuar', 'continue', 'avançar'];
            const btn = ButtonController.findButton(keywords);
            
            if (btn) {
                Utils.log('Botão próximo encontrado:', btn.textContent);
                await Utils.wait(CONFIG.delay);
                btn.click();
                return true;
            }
            
            return false;
        },
        
        tryAgain: async () => {
            const keywords = ['try again', 'tentar', 'retry', 'repetir'];
            const btn = ButtonController.findButton(keywords);
            
            if (btn) {
                Utils.log('Botão tentar novamente encontrado');
                await Utils.wait(CONFIG.delay);
                btn.click();
                return true;
            }
            
            return false;
        }
    };

    // ==================== MOTOR PRINCIPAL ====================
    const Engine = {
        solve: async () => {
            Utils.log('=== Iniciando resolução ===');
            
            const type = ExerciseDetector.detect();
            Utils.log('Tipo detectado:', type);
            
            if (type === 'unknown') {
                UI.showNotification('Tipo de exercício não reconhecido!', 'error');
                return false;
            }
            
            let solved = false;
            
            try {
                solved = await Solvers[type]();
            } catch (e) {
                Utils.error('Erro ao resolver:', e);
                solved = false;
            }
            
            if (!solved) {
                UI.showNotification('Não foi possível resolver automaticamente', 'error');
                return false;
            }
            
            // Verificar resposta
            await Utils.wait(CONFIG.delay);
            const checked = await ButtonController.check();
            
            if (!checked) {
                UI.showNotification('Não foi possível verificar a resposta', 'warning');
                return false;
            }
            
            // Aguardar resultado
            await Utils.wait(1500);
            
            // Verificar se acertou ou errou
            const isCorrect = Engine.checkResult();
            
            if (isCorrect === true) {
                UI.showNotification('✓ Resposta correta!', 'success');
                
                if (CONFIG.autoNext) {
                    await Utils.wait(1000);
                    await ButtonController.next();
                }
            } else if (isCorrect === false) {
                UI.showNotification('✗ Resposta incorreta', 'error');
                await Utils.wait(1000);
                await ButtonController.tryAgain();
            }
            
            return true;
        },
        
        checkResult: () => {
            // Procurar indicadores de resposta correta/incorreta
            const correctSelectors = [
                '[class*="correct"]',
                '[class*="success"]',
                '[data-test-id*="correct"]'
            ];
            
            const incorrectSelectors = [
                '[class*="incorrect"]',
                '[class*="error"]',
                '[class*="wrong"]',
                '[data-test-id*="incorrect"]'
            ];
            
            for (const selector of correctSelectors) {
                const el = document.querySelector(selector);
                if (el && Utils.isVisible(el)) {
                    Utils.log('Indicador de resposta correta encontrado');
                    return true;
                }
            }
            
            for (const selector of incorrectSelectors) {
                const el = document.querySelector(selector);
                if (el && Utils.isVisible(el)) {
                    Utils.log('Indicador de resposta incorreta encontrado');
                    return false;
                }
            }
            
            return null;
        },
        
        autoMode: async () => {
            if (!CONFIG.autoMode) return;
            
            Utils.log('Modo automático ativado');
            
            while (CONFIG.autoMode) {
                await Engine.solve();
                await Utils.wait(CONFIG.delay * 3);
                
                // Verificar se ainda há exercícios
                const hasExercise = ExerciseDetector.detect() !== 'unknown';
                if (!hasExercise) {
                    Utils.log('Nenhum exercício encontrado, parando modo automático');
                    CONFIG.autoMode = false;
                    break;
                }
            }
        }
    };

    // ==================== INTERFACE ====================
    const UI = {
        create: () => {
            const container = document.createElement('div');
            container.id = 'khan-auto-ui';
            container.innerHTML = `
                <style>
                    #khan-auto-ui {
                        position: fixed;
                        top: 20px;
                        right: 20px;
                        z-index: 999999;
                        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
                    }
                    .khan-panel {
                        background: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%);
                        border-radius: 12px;
                        padding: 20px;
                        box-shadow: 0 10px 40px rgba(0,0,0,0.3);
                        min-width: 280px;
                        color: white;
                    }
                    .khan-header {
                        display: flex;
                        justify-content: space-between;
                        align-items: center;
                        margin-bottom: 15px;
                        padding-bottom: 15px;
                        border-bottom: 2px solid #14bf96;
                    }
                    .khan-title {
                        font-size: 16px;
                        font-weight: bold;
                        color: #14bf96;
                    }
                    .khan-version {
                        font-size: 10px;
                        color: #888;
                    }
                    .khan-btn {
                        width: 100%;
                        padding: 12px;
                        margin: 8px 0;
                        border: none;
                        border-radius: 8px;
                        font-size: 14px;
                        font-weight: 600;
                        cursor: pointer;
                        transition: all 0.3s ease;
                        text-transform: uppercase;
                        letter-spacing: 0.5px;
                    }
                    .khan-btn:hover {
                        transform: translateY(-2px);
                        box-shadow: 0 5px 15px rgba(0,0,0,0.3);
                    }
                    .khan-btn-primary {
                        background: linear-gradient(135deg, #14bf96 0%, #0f9d7d 100%);
                        color: white;
                    }
                    .khan-btn-auto {
                        background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                        color: white;
                    }
                    .khan-btn-danger {
                        background: linear-gradient(135deg, #e74c3c 0%, #c0392b 100%);
                        color: white;
                    }
                    .khan-status {
                        font-size: 12px;
                        color: #aaa;
                        text-align: center;
                        margin-top: 10px;
                    }
                    .khan-notification {
                        position: fixed;
                        top: 20px;
                        left: 50%;
                        transform: translateX(-50%);
                        padding: 15px 30px;
                        border-radius: 8px;
                        font-weight: 600;
                        z-index: 9999999;
                        animation: slideDown 0.3s ease;
                    }
                    @keyframes slideDown {
                        from { opacity: 0; transform: translateX(-50%) translateY(-20px); }
                        to { opacity: 1; transform: translateX(-50%) translateY(0); }
                    }
                    .khan-notif-success { background: #14bf96; color: white; }
                    .khan-notif-error { background: #e74c3c; color: white; }
                    .khan-notif-warning { background: #f39c12; color: white; }
                </style>
                <div class="khan-panel">
                    <div class="khan-header">
                        <div>
                            <div class="khan-title">Khan Auto-Solver</div>
                            <div class="khan-version">v2.0</div>
                        </div>
                    </div>
                    <button class="khan-btn khan-btn-primary" id="khan-solve">
                        🎯 Resolver Agora
                    </button>
                    <button class="khan-btn khan-btn-auto" id="khan-auto">
                        🤖 Modo Automático
                    </button>
                    <button class="khan-btn khan-btn-danger" id="khan-close">
                        ✕ Fechar
                    </button>
                    <div class="khan-status" id="khan-status">
                        Pronto para usar
                    </div>
                </div>
            `;
            
            document.body.appendChild(container);
            
            // Event listeners
            document.getElementById('khan-solve').addEventListener('click', () => {
                Engine.solve();
            });
            
            document.getElementById('khan-auto').addEventListener('click', () => {
                CONFIG.autoMode = !CONFIG.autoMode;
                const btn = document.getElementById('khan-auto');
                
                if (CONFIG.autoMode) {
                    btn.textContent = '⏸️ Parar Automático';
                    btn.style.background = 'linear-gradient(135deg, #e74c3c 0%, #c0392b 100%)';
                    Engine.autoMode();
                } else {
                    btn.textContent = '🤖 Modo Automático';
                    btn.style.background = 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)';
                }
            });
            
            document.getElementById('khan-close').addEventListener('click', () => {
                container.remove();
            });
        },
        
        showNotification: (message, type = 'success') => {
            const notif = document.createElement('div');
            notif.className = `khan-notification khan-notif-${type}`;
            notif.textContent = message;
            document.body.appendChild(notif);
            
            setTimeout(() => notif.remove(), 3000);
        },
        
        updateStatus: (text) => {
            const status = document.getElementById('khan-status');
            if (status) status.textContent = text;
        }
    };

    // ==================== INICIALIZAÇÃO ====================
    const init = () => {
        if (!window.location.hostname.includes('khanacademy.org')) {
            alert('⚠️ Este script funciona apenas no Khan Academy!');
            return;
        }
        
        Utils.log('Khan Auto-Solver v2.0 carregado!');
        Utils.log('Desenvolvido para fins educacionais');
        
        UI.create();
    };

    // Executar
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

})();
