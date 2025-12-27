// Supabase 配置 - 请在这里配置你的 Supabase 项目信息
const SUPABASE_URL = 'https://xefvstkqpyqbzmghgzvy.supabase.co'; // 你的 Supabase Project URL
const SUPABASE_ANON_KEY = 'sb_publishable_WPO1dUMK3AafTWUFSa4ZMA_J4e5Us-O'; // 你的 Supabase Publishable Key (anon key)

// 初始化 Supabase 客户端
let supabase = null;
if (SUPABASE_URL && SUPABASE_ANON_KEY) {
    supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
}

// DOM 元素
const chatMessages = document.getElementById('chatMessages');
const messageInput = document.getElementById('messageInput');
const sendButton = document.getElementById('sendButton');
const settingsButton = document.getElementById('settingsButton');
const settingsPanel = document.getElementById('settingsPanel');
const chatPanel = document.getElementById('chatPanel');
const settingsForm = document.getElementById('settingsForm');
const cancelSettings = document.getElementById('cancelSettings');

// 全局变量
let conversationId = null;
let apiConfig = null;

// 初始化
document.addEventListener('DOMContentLoaded', async () => {
    // 检查 Supabase 是否配置
    if (!supabase) {
        alert('请先配置 Supabase URL 和 Key');
        showSettings();
        return;
    }

    // 加载配置
    await loadConfig();

    // 如果配置不存在，显示设置面板
    if (!apiConfig) {
        showSettings();
    }

    // 事件监听
    setupEventListeners();
});

// 设置事件监听器
function setupEventListeners() {
    // 自动调整输入框高度
    messageInput.addEventListener('input', () => {
        messageInput.style.height = 'auto';
        messageInput.style.height = messageInput.scrollHeight + 'px';
    });

    // 发送消息
    sendButton.addEventListener('click', sendMessage);
    messageInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            sendMessage();
        }
    });

    // 设置按钮
    settingsButton.addEventListener('click', () => {
        if (settingsPanel.classList.contains('hidden')) {
            showSettings();
        } else {
            hideSettings();
        }
    });

    // 取消设置
    cancelSettings.addEventListener('click', () => {
        hideSettings();
    });

    // 提交设置表单
    settingsForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        await saveConfig();
    });
}

// 显示设置面板
function showSettings() {
    settingsPanel.classList.remove('hidden');
    chatPanel.style.display = 'none';
    
    // 如果已有配置，填充表单
    if (apiConfig) {
        document.getElementById('apiUrl').value = apiConfig.api_url || 'https://open.bigmodel.cn/api/paas/v4/chat/completions';
        document.getElementById('apiKey').value = apiConfig.api_key || '';
        document.getElementById('modelName').value = apiConfig.model_name || 'glm-4.7';
    }
}

// 隐藏设置面板
function hideSettings() {
    settingsPanel.classList.add('hidden');
    chatPanel.style.display = '';
}

// 从数据库加载配置
async function loadConfig() {
    try {
        const { data, error } = await supabase
            .from('api_config')
            .select('*')
            .eq('id', 1)
            .single();

        if (error) {
            if (error.code === 'PGRST116') {
                // 配置不存在，这是正常的
                console.log('配置不存在，需要首次配置');
                return;
            }
            throw error;
        }

        apiConfig = data;
        console.log('配置加载成功');
    } catch (error) {
        console.error('加载配置失败:', error);
        alert('加载配置失败，请检查 Supabase 连接');
    }
}

// 保存配置到数据库
async function saveConfig() {
    const apiUrl = document.getElementById('apiUrl').value.trim();
    const apiKey = document.getElementById('apiKey').value.trim();
    const modelName = document.getElementById('modelName').value.trim();

    if (!apiUrl || !apiKey || !modelName) {
        alert('请填写所有必填字段');
        return;
    }

    try {
        const configData = {
            id: 1,
            api_url: apiUrl || 'https://open.bigmodel.cn/api/paas/v4/chat/completions',
            api_key: apiKey,
            model_name: modelName || 'glm-4.7'
        };

        // 先尝试更新
        const { data: updateData, error: updateError } = await supabase
            .from('api_config')
            .update(configData)
            .eq('id', 1)
            .select()
            .single();

        if (updateError && updateError.code === 'PGRST116') {
            // 如果不存在，则插入
            const { data: insertData, error: insertError } = await supabase
                .from('api_config')
                .insert(configData)
                .select()
                .single();

            if (insertError) throw insertError;
            apiConfig = insertData;
        } else {
            if (updateError) throw updateError;
            apiConfig = updateData;
        }

        alert('配置保存成功！');
        hideSettings();
    } catch (error) {
        console.error('保存配置失败:', error);
        alert('保存配置失败: ' + error.message);
    }
}

// 发送消息
async function sendMessage() {
    const message = messageInput.value.trim();
    if (!message || sendButton.disabled) return;

    // 检查配置
    if (!apiConfig) {
        alert('请先配置API信息');
        showSettings();
        return;
    }

    // 添加用户消息到界面
    addMessage(message, 'user');
    messageInput.value = '';
    messageInput.style.height = 'auto';

    // 禁用输入
    sendButton.disabled = true;
    messageInput.disabled = true;

    // 显示加载指示器
    const loadingId = showTypingIndicator();

    try {
        // 调用 AI API
        const response = await callAIAPI(message);

        // 移除加载指示器
        removeTypingIndicator(loadingId);

        // 添加AI回复
        if (response) {
            addMessage(response, 'bot');
            
            // 保存消息到数据库
            await saveMessage(message, 'user');
            await saveMessage(response, 'assistant');
        }

    } catch (error) {
        console.error('发送消息错误:', error);
        removeTypingIndicator(loadingId);
        addMessage('抱歉，发生了一些错误。请稍后再试。', 'bot');
    } finally {
        // 重新启用输入
        sendButton.disabled = false;
        messageInput.disabled = false;
        messageInput.focus();
    }
}

// 调用 AI API
async function callAIAPI(userMessage) {
    try {
        // 获取历史消息
        const history = await getRecentMessages(10);

        // 构建消息列表
        const messages = [
            {
                role: 'system',
                content: '你是一位专业的简历生成助手。通过友好的对话了解用户的基本信息、教育背景、工作经历、技能特长等，然后为用户生成一份专业的简历。'
            },
            ...history,
            {
                role: 'user',
                content: userMessage
            }
        ];

        // 调用 API
        const response = await fetch(apiConfig.api_url, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${apiConfig.api_key}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                model: apiConfig.model_name,
                messages: messages,
                thinking: {
                    type: "enabled"
                },
                max_tokens: 65536,
                temperature: 1.0
            })
        });

        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            throw new Error(errorData.error?.message || `HTTP ${response.status}`);
        }

        const data = await response.json();

        // 处理智谱API的响应格式
        if (data.choices && data.choices[0]) {
            const choice = data.choices[0];
            // 优先获取message.content，如果没有则尝试其他字段
            if (choice.message && choice.message.content) {
                return choice.message.content.trim();
            } else if (choice.delta && choice.delta.content) {
                return choice.delta.content.trim();
            } else {
                // 尝试直接获取content字段
                const content = choice.content || choice.message?.content || '';
                return content.toString().trim();
            }
        } else {
            console.error('API响应数据:', data);
            throw new Error('API返回格式异常: ' + JSON.stringify(data));
        }

    } catch (error) {
        console.error('API调用错误:', error);
        throw error;
    }
}

// 获取最近的消息
async function getRecentMessages(limit = 10) {
    if (!conversationId) return [];

    try {
        const { data, error } = await supabase
            .from('messages')
            .select('role, content')
            .eq('conversation_id', conversationId)
            .order('created_at', { ascending: false })
            .limit(limit);

        if (error) throw error;

        return data.reverse().map(msg => ({
            role: msg.role,
            content: msg.content
        }));
    } catch (error) {
        console.error('获取消息历史失败:', error);
        return [];
    }
}

// 保存消息到数据库
async function saveMessage(content, role) {
    try {
        // 确保有会话ID
        if (!conversationId) {
            conversationId = await createConversation();
        }

        const { error } = await supabase
            .from('messages')
            .insert({
                conversation_id: conversationId,
                role: role,
                content: content
            });

        if (error) throw error;
    } catch (error) {
        console.error('保存消息失败:', error);
    }
}

// 创建新会话
async function createConversation() {
    try {
        const sessionId = generateSessionId();
        const { data, error } = await supabase
            .from('conversations')
            .insert({
                session_id: sessionId
            })
            .select()
            .single();

        if (error) throw error;
        return data.id;
    } catch (error) {
        console.error('创建会话失败:', error);
        throw error;
    }
}

// 生成会话ID
function generateSessionId() {
    return 'session_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
}

// 添加消息到聊天界面
function addMessage(text, type) {
    const messageDiv = document.createElement('div');
    messageDiv.className = `message ${type}-message`;

    const avatar = document.createElement('div');
    avatar.className = 'avatar';
    avatar.textContent = type === 'user' ? '👤' : '🤖';

    const content = document.createElement('div');
    content.className = 'message-content';

    // 处理多行文本
    const paragraphs = text.split('\n').filter(p => p.trim());
    paragraphs.forEach(p => {
        const pTag = document.createElement('p');
        pTag.textContent = p;
        content.appendChild(pTag);
    });

    messageDiv.appendChild(avatar);
    messageDiv.appendChild(content);
    chatMessages.appendChild(messageDiv);

    // 滚动到底部
    chatMessages.scrollTop = chatMessages.scrollHeight;
}

// 显示输入指示器
function showTypingIndicator() {
    const indicatorId = 'typing-' + Date.now();
    const messageDiv = document.createElement('div');
    messageDiv.className = 'message bot-message';
    messageDiv.id = indicatorId;

    const avatar = document.createElement('div');
    avatar.className = 'avatar';
    avatar.textContent = '🤖';

    const content = document.createElement('div');
    content.className = 'message-content typing-indicator';
    content.innerHTML = `
        <div class="typing-dot"></div>
        <div class="typing-dot"></div>
        <div class="typing-dot"></div>
    `;

    messageDiv.appendChild(avatar);
    messageDiv.appendChild(content);
    chatMessages.appendChild(messageDiv);
    chatMessages.scrollTop = chatMessages.scrollHeight;

    return indicatorId;
}

// 移除输入指示器
function removeTypingIndicator(id) {
    const element = document.getElementById(id);
    if (element) {
        element.remove();
    }
}
