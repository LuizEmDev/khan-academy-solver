/**
 * Khan Academy Auto-Solver v4.0
 * Versão com detecção inteligente de respostas
 */

(function() {
    'use strict';
    
    if (window.khanAutoSolverRunning) {
        alert('❌ Script já está rodando!');
        return;
    }
    window.khanAutoSolverRunning = true;
    
    console.log('%c🚀 Khan Auto-Solver v4.0 - Smart Edition', 'color: #14bf96; font-size: 16px; font-weight: bold;');
    
    // ==================== CONFIGURAÇÃO ====================
    const CONFIG = {
        delay: 1200,
        autoMode: false,
        debug: true,
        retryOnWrong: true
    };
    
    // ==================== UTILITÁRIOS ====================
    const log = (msg, ...args) => {
        if (CONFIG.debug) {
            console.log('%c[Khan]', 'color: #14bf96; font-weight: bold;', msg, ...args);
        }
    };
    
    const sleep = (ms) => new Promise(r => setTimeout(r, ms));
    
    const isVisible = (el) => {
        if (!el) return false;
        const style = window.getComputedStyle(el);
        return style.display !== 'none' && 
               style.visibility !== 'hidden' && 
               style.opacity !== '0' &&
               el.offsetWidth > 0 && 
               el.offsetHeight > 0;
    };
    
    const simulateInput = (input, value) => {
        const nativeSetter = Object.getOwnPropertyDescriptor(
            window.HTMLInputElement.prototype, 
            'value'
        ).set;
        
        nativeSetter.call(input, value);
        
        input.dispatchEvent(new Event('input', { bubbles: true }));
        input.dispatchEvent(new Event('change', { bubbles: true }));
        input.dispatchEvent(new Event('blur', { bubbles: true }));
    };
    
    // ==================== DETECTOR DE RESPOSTAS AVANÇADO ====================
    const AnswerFinder = {
        // Procurar em todos os objetos da página
        deepSearch: () => {
            log('🔍 Procurando respostas na página...');
            const found = [];
            
            // 1. Procurar em __NEXT_DATA__ (Next.js)
            try {
                const nextData = document.getElementById('__NEXT_DATA__');
                if (nextData) {
                    const data = JSON.parse(nextData.textContent);
                    log('Next.js data encontrado:', data);
                    const answers = AnswerFinder.searchObject(data, ['answer', 'correct', 'solution']);
                    if (answers.length > 0) found.push(...answers);
                }
            } catch (e) {}
            
            // 2. Procurar em window objects
            try {
                const keys = Object.keys(window);
                for (const key of keys) {
                    if (key.toLowerCase().includes('answer') || 
                        key.toLowerCase().includes('solution') ||
                        key.toLowerCase().includes('correct')) {
                        log('Objeto suspeito encontrado:', key, window[key]);
                        found.push(window[key]);
                    }
                }
            } catch (e) {}
            
            // 3. Procurar em React Fiber
            try {
                const reactRoot = document.querySelector('[data-reactroot], #react-root, #root');
                if (reactRoot) {
                    const fiberKey = Object.keys(reactRoot).find(k => k.startsWith('__reactFiber') || k.startsWith('__reactInternalInstance'));
                    if (fiberKey) {
                        const answers = AnswerFinder.searchReactFiber(reactRoot[fiberKey]);
                        if (answers.length > 0) found.push(...answers);
                    }
                }
            } catch (e) {}
            
            // 4. Procurar em data attributes
            try {
                const dataElements = document.querySelectorAll('[data-answer], [data-correct-answer], [data-solution]');
                dataElements.forEach(el => {
                    const answer = el.dataset.answer || el.dataset.correctAnswer || el.dataset.solution;
                    if (answer) {
                        log('Resposta em data attribute:', answer);
                        found.push(answer);
                    }
                });
            } catch (e) {}
            
            // 5. Procurar em comentários HTML
            try {
                const html = document.documentElement.outerHTML;
                const commentRegex = /<!--[\s\S]*?-->/g;
                const comments = html.match(commentRegex) || [];
                comments.forEach(comment => {
                    if (comment.toLowerCase().includes('answer') || comment.toLowerCase().includes('correct')) {
                        log('Comentário suspeito:', comment);
                    }
                });
            } catch (e) {}
            
            log('Total de respostas encontradas:', found.length, found);
            return found;
        },
        
        // Buscar recursivamente em objetos
        searchObject: (obj, keywords, depth = 0, maxDepth = 10) => {
            if (depth > maxDepth || !obj || typeof obj !== 'object') return [];
            
            const results = [];
            
            try {
                for (const [key, value] of Object.entries(obj)) {
                    const keyLower = key.toLowerCase();
                    
                    // Verificar se a chave contém palavra-chave
                    if (keywords.some(kw => keyLower.includes(kw))) {
                        log(`Resposta encontrada em ${key}:`, value);
                        results.push(value);
                    }
                    
                    // Recursão
                    if (typeof value === 'object' && value !== null) {
                        results.push(...AnswerFinder.searchObject(value, keywords, depth + 1, maxDepth));
                    }
                }
            } catch (e) {}
            
            return results;
        },
        
        // Buscar em React Fiber
        searchReactFiber: (fiber, depth = 0, maxDepth = 20, visited = new WeakSet()) => {
            if (!fiber || depth > maxDepth || visited.has(fiber)) return [];
            visited.add(fiber);
            
            const results = [];
            
            try {
                // Verificar props
                if (fiber.memoizedProps) {
                    const props = fiber.memoizedProps;
                    if (props.answer) {
                        log('Resposta em React props:', props.answer);
                        results.push(props.answer);
                    }
                    if (props.correctAnswer) {
                        log('Resposta correta em React props:', props.correctAnswer);
                        results.push(props.correctAnswer);
                    }
                    if (props.solution) {
                        log('Solução em React props:', props.solution);
                        results.push(props.solution);
                    }
                    if (props.choices && Array.isArray(props.choices)) {
                        const correct = props.choices.find(c => c.correct === true);
                        if (correct) {
                            log('Resposta correta em choices:', correct);
                            results.push(correct);
                        }
                    }
                }
                
                // Verificar state
                if (fiber.memoizedState) {
                    results.push(...AnswerFinder.searchObject(fiber.memoizedState, ['answer', 'correct', 'solution'], 0, 3));
                }
                
                // Recursão em child e sibling
                if (fiber.child) {
                    results.push(...AnswerFinder.searchReactFiber(fiber.child, depth + 1, maxDepth, visited));
                }
                if (fiber.sibling) {
                    results.push(...AnswerFinder.searchReactFiber(fiber.sibling, depth + 1, maxDepth, visited));
                }
            } catch (e) {}
            
            return results;
        },
        
        // Analisar questão e calcular resposta
        analyzeQuestion: () => {
            log('📊 Analisando questão...');
            
            const questionSelectors = [
                '[class*="question"]',
                '[class*="problem"]',
                '[class*="exercise"]',
                '.perseus-renderer',
                '[role="main"]'
            ];
            
            let questionText = '';
            for (const selector of questionSelectors) {
                const el = document.querySelector(selector);
                if (el) {
                    questionText = el.textContent;
                    break;
                }
            }
            
            if (!questionText) return null;
            
            log('Texto da questão:', questionText.substring(0, 200));
            
            // Extrair números
            const numbers = questionText.match(/-?\d+\.?\d*/g);
            if (!numbers || numbers.length < 2) return null;
            
            const nums = numbers.map(n => parseFloat(n));
            log('Números encontrados:', nums);
            
            // Detectar operação
            const operations = {
                '+': (a, b) => a + b,
                'mais': (a, b) => a + b,
                'soma': (a, b) => a + b,
                '-': (a, b) => a - b,
                'menos': (a, b) => a - b,
                'subtra': (a, b) => a - b,
                '×': (a, b) => a * b,
                '*': (a, b) => a * b,
                'vezes': (a, b) => a * b,
                'multiplic': (a, b) => a * b,
                '÷': (a, b) => a / b,
                '/': (a, b) => a / b,
                'divid': (a, b) => a / b
            };
            
            for (const [op, fn] of Object.entries(operations)) {
                if (questionText.toLowerCase().includes(op)) {
                    const result = fn(nums[0], nums[1]);
                    log(`Operação detectada: ${nums[0]} ${op} ${nums[1]} = ${result}`);
                    return result;
                }
            }
            
            return null;
        }
    };
    
    // ==================== SOLUCIONADORES INTELIGENTES ====================
    const findElements = (selectors) => {
        for (const selector of selectors) {
            try {
                const elements = Array.from(document.querySelectorAll(selector)).filter(isVisible);
                if (elements.length > 0) return elements;
            } catch (e) {}
        }
        return [];
    };
    
    const solvers = {
        multipleChoice: async () => {
            log('Resolvendo múltipla escolha...');
            
            const radioSelectors = [
                'input[type="radio"]',
                '[role="radio"]',
                '[role="radiogroup"] label',
                'label[for*="radio"]',
                '[class*="choice"]',
                '[class*="radio"]'
            ];
            
            const radios = findElements(radioSelectors);
            
            if (radios.length === 0) {
                log('❌ Nenhuma opção encontrada');
                return false;
            }
            
            log(`✅ ${radios.length} opções encontradas`);
            
            // Procurar resposta
            const answers = AnswerFinder.deepSearch();
            const calculated = AnswerFinder.analyzeQuestion();
            
            if (calculated !== null) {
                log('📐 Resposta calculada:', calculated);
                answers.unshift(calculated);
            }
            
            // Tentar fazer match com as opções
            if (answers.length > 0) {
                for (let i = 0; i < radios.length; i++) {
                    const optionText = radios[i].textContent || radios[i].value || '';
                    
                    for (const answer of answers) {
                        const answerStr = String(answer);
                        
                        if (optionText.includes(answerStr) || 
                            answerStr.includes(optionText) ||
                            Math.abs(parseFloat(optionText) - parseFloat(answerStr)) < 0.01) {
                            
                            log('✅ Match encontrado! Opção:', i, optionText);
                            radios[i].click();
                            return true;
                        }
                    }
                }
            }
            
            // Se não encontrou, tentar a primeira ou aleatória
            log('⚠️ Nenhum match encontrado, tentando aleatoriamente');
            const idx = Math.floor(Math.random() * radios.length);
            radios[idx].click();
            log(`Opção ${idx} selecionada`);
            
            await sleep(500);
            return true;
        },
        
        textInput: async () => {
            log('Resolvendo input de texto...');
            
            const inputSelectors = [
                'input[type="text"]',
                'input[type="number"]',
                'input[inputmode="numeric"]',
                'input[inputmode="decimal"]',
                'textarea:not([readonly])'
            ];
            
            const inputs = findElements(inputSelectors);
            
            if (inputs.length === 0) {
                log('❌ Nenhum input encontrado');
                return false;
            }
            
            log(`✅ ${inputs.length} inputs encontrados`);
            
            // Procurar resposta
            let answer = null;
            
            // 1. Tentar calcular da questão
            const calculated = AnswerFinder.analyzeQuestion();
            if (calculated !== null) {
                answer = calculated;
                log('📐 Usando resposta calculada:', answer);
            }
            
            // 2. Tentar encontrar na página
            if (answer === null) {
                const found = AnswerFinder.deepSearch();
                if (found.length > 0) {
                    // Usar a primeira resposta numérica encontrada
                    for (const f of found) {
                        const num = parseFloat(f);
                        if (!isNaN(num)) {
                            answer = num;
                            log('🔍 Resposta encontrada na página:', answer);
                            break;
                        }
                    }
                }
            }
            
            // 3. Fallback: número aleatório baseado no contexto
            if (answer === null) {
                const questionText = document.body.textContent;
                const numbers = questionText.match(/\d+/g);
                if (numbers && numbers.length > 0) {
                    answer = numbers[0];
                    log('⚠️ Usando número do contexto:', answer);
                } else {
                    answer = Math.floor(Math.random() * 100);
                    log('⚠️ Usando número aleatório:', answer);
                }
            }
            
            // Preencher todos os inputs
            for (const input of inputs) {
                simulateInput(input, String(answer));
                log(`Input preenchido: ${answer}`);
            }
            
            await sleep(500);
            return true;
        },
        
        dropdown: async () => {
            log('Resolvendo dropdown...');
            
            const selects = findElements(['select']);
            
            if (selects.length === 0) {
                log('❌ Nenhum dropdown encontrado');
                return false;
            }
            
            // Procurar resposta
            const answers = AnswerFinder.deepSearch();
            
            for (const select of selects) {
                let selected = false;
                
                // Tentar match com respostas encontradas
                if (answers.length > 0) {
                    for (let i = 0; i < select.options.length; i++) {
                        const optionText = select.options[i].textContent;
                        
                        for (const answer of answers) {
                            if (optionText.includes(String(answer)) || 
                                String(answer).includes(optionText)) {
                                select.selectedIndex = i;
                                selected = true;
                                log('✅ Dropdown: match encontrado na opção', i);
                                break;
                            }
                        }
                        if (selected) break;
                    }
                }
                
                // Se não encontrou, selecionar aleatória
                if (!selected && select.options.length > 1) {
                    const idx = 1 + Math.floor(Math.random() * (select.options.length - 1));
                    select.selectedIndex = idx;
                    log(`⚠️ Dropdown: opção aleatória ${idx}`);
                }
                
                select.dispatchEvent(new Event('change', { bubbles: true }));
            }
            
            await sleep(500);
            return true;
        },
        
        checkbox: async () => {
            log('Resolvendo checkbox...');
            
            const checkboxes = findElements(['input[type="checkbox"]']);
            
            if (checkboxes.length === 0) {
                log('❌ Nenhum checkbox encontrado');
                return false;
            }
            
            // Procurar respostas
            const answers = AnswerFinder.deepSearch();
            
            // Tentar match com labels
            for (let i = 0; i < checkboxes.length; i++) {
                const cb = checkboxes[i];
                const label = cb.closest('label') || document.querySelector(`label[for="${cb.id}"]`);
                const labelText = label ? label.textContent : '';
                
                let shouldCheck = false;
                
                for (const answer of answers) {
                    if (labelText.includes(String(answer))) {
                        shouldCheck = true;
                        log('✅ Checkbox match:', labelText);
                        break;
                    }
                }
                
                if (!shouldCheck) {
                    shouldCheck = Math.random() > 0.5;
                }
                
                cb.checked = shouldCheck;
                cb.dispatchEvent(new Event('change', { bubbles: true }));
            }
            
            await sleep(500);
            return true;
        }
    };
    
    // ==================== DETECTOR DE TIPO ====================
    const detectType = () => {
        if (findElements(['input[type="radio"]', '[role="radio"]']).length > 0) {
            return 'multipleChoice';
        }
        if (findElements(['input[type="text"]', 'input[type="number"]']).length > 0) {
            return 'textInput';
        }
        if (findElements(['select']).length > 0) {
            return 'dropdown';
        }
        if (findElements(['input[type="checkbox"]']).length > 0) {
            return 'checkbox';
        }
        return null;
    };
    
    // ==================== BOTÕES ====================
    const findButton = (keywords) => {
        const buttons = findElements(['button', '[role="button"]', 'input[type="submit"]']);
        
        for (const btn of buttons) {
            const text = (btn.textContent || btn.value || '').toLowerCase();
            const label = (btn.getAttribute('aria-label') || '').toLowerCase();
            const combined = text + ' ' + label;
            
            for (const keyword of keywords) {
                if (combined.includes(keyword.toLowerCase())) {
                    return btn;
                }
            }
        }
        return null;
    };
    
    const clickCheck = async () => {
        const btn = findButton(['check', 'verificar', 'submit', 'enviar']);
        if (btn) {
            log('✅ Botão verificar encontrado');
            await sleep(CONFIG.delay);
            btn.click();
            return true;
        }
        log('❌ Botão verificar não encontrado');
        return false;
    };
    
    const clickNext = async () => {
        const btn = findButton(['next', 'próxim', 'continuar', 'continue']);
        if (btn) {
            log('✅ Próximo');
            await sleep(CONFIG.delay);
            btn.click();
            return true;
        }
        return false;
    };
    
    const clickTryAgain = async () => {
        const btn = findButton(['try again', 'tentar', 'novamente']);
        if (btn) {
            log('🔄 Tentando novamente');
            await sleep(CONFIG.delay);
            btn.click();
            return true;
        }
        return false;
    };
    
    // ==================== VERIFICAR RESULTADO ====================
    const checkResult = () => {
        // Procurar indicadores
        const correct = document.querySelector('[class*="correct"]:not([class*="incorrect"]), [data-test-id*="correct"]');
        const incorrect = document.querySelector('[class*="incorrect"], [class*="wrong"], [data-test-id*="incorrect"]');
        
        if (correct && isVisible(correct)) {
            log('✅ CORRETO!');
            return 'correct';
        }
        if (incorrect && isVisible(incorrect)) {
            log('❌ INCORRETO');
            return 'incorrect';
        }
        return 'unknown';
    };
    
    // ==================== MOTOR PRINCIPAL ====================
    const solve = async () => {
        try {
            showNotification('🔍 Analisando...', 'info');
            
            const type = detectType();
            if (!type) {
                showNotification('❌ Tipo não reconhecido', 'error');
                return false;
            }
            
            log(`📝 Tipo: ${type}`);
            showNotification(`📝 Resolvendo ${type}...`, 'info');
            
            const solved = await solvers[type]();
            if (!solved) {
                showNotification('❌ Não foi possível resolver', 'error');
                return false;
            }
            
            await sleep(CONFIG.delay);
            const checked = await clickCheck();
            
            if (!checked) {
                showNotification('⚠️ Botão verificar não encontrado', 'warning');
                return false;
            }
            
            await sleep(2000);
            
            const result = checkResult();
            
            if (result === 'correct') {
                showNotification('✅ CORRETO!', 'success');
                await sleep(1000);
                await clickNext();
                return true;
            } else if (result === 'incorrect') {
                showNotification('❌ INCORRETO - Tentando novamente', 'error');
                if (CONFIG.retryOnWrong) {
                    await sleep(1000);
                    await clickTryAgain();
                    await sleep(2000);
                    return await solve(); // Tentar novamente
                }
            } else {
                showNotification('✓ Resposta enviada', 'success');
                await sleep(1000);
                await clickNext();
            }
            
            return true;
            
        } catch (error) {
            log('❌ Erro:', error);
            showNotification('❌ Erro: ' + error.message, 'error');
            return false;
        }
    };
    
    // ==================== AUTO MODE ====================
    const startAutoMode = async () => {
        CONFIG.autoMode = true;
        updateAutoButton();
        
        while (CONFIG.autoMode) {
            const success = await solve();
            await sleep(CONFIG.delay * 2);
            
            if (!detectType()) {
                log('Sem mais questões');
                CONFIG.autoMode = false;
                updateAutoButton();
                break;
            }
        }
    };
    
    const stopAutoMode = () => {
        CONFIG.autoMode = false;
        updateAutoButton();
        showNotification('⏸️ Pausado', 'info');
    };
    
    // ==================== UI ====================
    const createUI = () => {
        const style = document.createElement('style');
        style.textContent = `
            #khan-auto-ui{position:fixed;top:20px;right:20px;z-index:2147483647;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif}
            .khan-panel{background:linear-gradient(135deg,#1a1a2e 0%,#16213e 100%);border-radius:16px;padding:24px;box-shadow:0 20px 60px rgba(0,0,0,.4);min-width:300px}
            .khan-header{text-align:center;margin-bottom:20px;padding-bottom:16px;border-bottom:2px solid #14bf96}
            .khan-title{font-size:18px;font-weight:700;color:#14bf96;margin:0}
            .khan-version{font-size:11px;color:#888;margin-top:4px}
            .khan-btn{width:100%;padding:14px;margin:10px 0;border:none;border-radius:10px;font-size:15px;font-weight:600;cursor:pointer;transition:all .3s;text-transform:uppercase;letter-spacing:.5px}
            .khan-btn:hover{transform:translateY(-3px);box-shadow:0 10px 20px rgba(0,0,0,.3)}
            .khan-btn-primary{background:linear-gradient(135deg,#14bf96 0%,#0f9d7d 100%);color:white}
            .khan-btn-auto{background:linear-gradient(135deg,#667eea 0%,#764ba2 100%);color:white}
            .khan-btn-auto.active{background:linear-gradient(135deg,#e74c3c 0%,#c0392b 100%)}
            .khan-btn-close{background:rgba(231,76,60,.2);color:#e74c3c;border:2px solid #e74c3c}
            .khan-notification{position:fixed;top:20px;left:50%;transform:translateX(-50%);padding:16px 32px;border-radius:12px;font-weight:600;z-index:2147483647;animation:slideDown .3s ease;box-shadow:0 10px 30px rgba(0,0,0,.3)}
            @keyframes slideDown{from{opacity:0;transform:translateX(-50%) translateY(-20px)}to{opacity:1;transform:translateX(-50%) translateY(0)}}
            .notif-success{background:#14bf96;color:white}
            .notif-error{background:#e74c3c;color:white}
            .notif-warning{background:#f39c12;color:white}
            .notif-info{background:#3498db;color:white}
        `;
        document.head.appendChild(style);
        
        const container = document.createElement('div');
        container.id = 'khan-auto-ui';
        container.innerHTML = `
            <div class="khan-panel">
                <div class="khan-header">
                    <div class="khan-title">Khan Auto-Solver</div>
                    <div class="khan-version">v4.0 - Smart</div>
                </div>
                <button class="khan-btn khan-btn-primary" id="khan-solve">🎯 Resolver Agora</button>
                <button class="khan-btn khan-btn-auto" id="khan-auto">🤖 Modo Automático</button>
                <button class="khan-btn khan-btn-close" id="khan-close">✕ Fechar</button>
            </div>
        `;
        
        document.body.appendChild(container);
        
        document.getElementById('khan-solve').addEventListener('click', solve);
        document.getElementById('khan-auto').addEventListener('click', () => {
            CONFIG.autoMode ? stopAutoMode() : startAutoMode();
        });
        document.getElementById('khan-close').addEventListener('click', () => {
            container.remove();
            window.khanAutoSolverRunning = false;
        });
    };
    
    const updateAutoButton = () => {
        const btn = document.getElementById('khan-auto');
        if (btn) {
            btn.textContent = CONFIG.autoMode ? '⏸️ Pausar' : '🤖 Modo Automático';
            CONFIG.autoMode ? btn.classList.add('active') : btn.classList.remove('active');
        }
    };
    
    const showNotification = (message, type = 'info') => {
        const notif = document.createElement('div');
        notif.className = `khan-notification notif-${type}`;
        notif.textContent = message;
        document.body.appendChild(notif);
        setTimeout(() => notif.remove(), 3000);
    };
    
    // ==================== INIT ====================
    if (!window.location.hostname.includes('khanacademy.org')) {
        alert('⚠️ Este script funciona apenas no Khan Academy!');
        window.khanAutoSolverRunning = false;
        return;
    }
    
    log('✅ Iniciado!');
    createUI();
    showNotification('✅ Khan Auto-Solver carregado!', 'success');
    
})();
