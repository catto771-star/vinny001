import { useSyncExternalStore } from "react";
export const supported = [
  ["pt-BR", "Português"],
  ["en", "English"],
  ["es", "Español"],
];
let locale = localStorage.getItem("eir.locale") || "pt-BR";
if (!supported.some(([l]) => l === locale)) locale = "pt-BR";
document.documentElement.lang = locale;
const translations = {};
export function addTranslations(lines) {
  for (const line of lines.trim().split("\n")) {
    const [pt, en, es] = line.split("|");
    if (pt && en && es) translations[pt] = { en, es };
  }
}
export const t = (value) => translations[value]?.[locale] || value;
export function setLocale(next) {
  if (!supported.some(([l]) => l === next)) return;
  locale = next;
  localStorage.setItem("eir.locale", locale);
  document.documentElement.lang = locale;
  window.dispatchEvent(new Event("eir-language"));
}
export function useLocale() {
  return useSyncExternalStore(
    (fn) => {
      window.addEventListener("eir-language", fn);
      return () => window.removeEventListener("eir-language", fn);
    },
    () => locale,
  );
}
addTranslations(`
Duplicar para ajustar|Duplicate to adjust|Duplicar para ajustar
Adicionar biblioteca inicial|Add starter library|Añadir biblioteca inicial
Visão geral|Overview|Vista general
Meus alunos|My students|Mis alumnos
Treinos|Workouts|Entrenamientos
Nutrição|Nutrition|Nutrición
Evolução|Progress|Evolución
Mensagens|Messages|Mensajes
Preferências|Preferences|Preferencias
Profissional|Professional|Profesional
Aluno|Student|Alumno
Personal trainer|Personal trainer|Entrenador personal
Nutricionista|Nutritionist|Nutricionista
Coach · treino e dieta|Coach · training and nutrition|Coach · entrenamiento y dieta
Área do aluno|Student area|Área del alumno
Área profissional|Professional area|Área profesional
TRABALHO|WORK|TRABAJO
EVOLUÇÃO|PROGRESS|EVOLUCIÓN
ESPAÇO DE|SPACE FOR|ESPACIO DE
SEU PRÓXIMO NÍVEL COMEÇA AQUI|YOUR NEXT LEVEL STARTS HERE|TU PRÓXIMO NIVEL EMPIEZA AQUÍ
Tudo pronto para evoluir.|Ready to make progress.|Todo listo para avanzar.
Um olhar sobre seus alunos. E sobre tudo o que vem pela frente.|Your students and everything that comes next, at a glance.|Tus alumnos y todo lo que viene, de un vistazo.
Seu treino, sua alimentação e cada conquista em um só lugar.|Your training, nutrition and achievements in one place.|Tu entrenamiento, alimentación y logros en un solo lugar.
Cada detalhe conta na construção de um resultado duradouro.|Every detail matters for lasting results.|Cada detalle cuenta para resultados duraderos.
Novo aluno|New student|Nuevo alumno
Alunos ativos|Active students|Alumnos activos
Todos os alunos cadastrados|All registered students|Todos los alumnos registrados
Treinos prescritos|Assigned workouts|Entrenamientos asignados
Planos de treino disponíveis|Available workout plans|Planes de entrenamiento disponibles
Refeições planejadas|Planned meals|Comidas planificadas
Nutrição com propósito|Nutrition with purpose|Nutrición con propósito
Atividades hoje|Activities today|Actividades de hoy
Cada conquista importa|Every achievement matters|Cada logro importa
Treinos concluídos|Completed workouts|Entrenamientos completados
Uma sessão de cada vez|One session at a time|Una sesión a la vez
Objetivo|Goal|Objetivo
Seu plano, seu ritmo|Your plan, your pace|Tu plan, tu ritmo
Refeições hoje|Meals today|Comidas de hoy
Peso atual|Current weight|Peso actual
Acompanhe além da balança|Track more than the scale|Mira más allá de la báscula
CONSISTÊNCIA TRANSFORMA|CONSISTENCY TRANSFORMS|LA CONSTANCIA TRANSFORMA
O plano é seu.|The plan is yours.|El plan es tuyo.
A evolução é de|Progress belongs to|La evolución es de
todos.|everyone.|todos.
Conecte treino e nutrição. Acompanhe cada passo.|Connect training and nutrition. Track every step.|Conecta entrenamiento y nutrición. Sigue cada paso.
Construa resultados que ficam.|Build lasting results.|Construye resultados duraderos.
Acompanhar meus alunos|Follow my students|Acompañar a mis alumnos
Começar meu treino|Start my workout|Empezar mi entrenamiento
Juntos em cada conquista.|Together in every achievement.|Juntos en cada logro.
Evolução contínua|Continuous progress|Evolución continua
Um dia melhor que o outro|Better, day by day|Mejor cada día
Atividade da semana|Weekly activity|Actividad semanal
Registros de treino e alimentação|Training and meal records|Registros de entrenamiento y alimentación
Atividades registradas|Recorded activities|Actividades registradas
Seus alunos|Your students|Tus alumnos
De perto, mesmo à distância.|Close, even from a distance.|Cerca, incluso a distancia.
Ver todos|View all|Ver todos
Seu treino de hoje|Your workout today|Tu entrenamiento de hoy
Iniciar treino|Start workout|Iniciar entrenamiento
Seu profissional ainda não publicou um treino.|Your professional has not published a workout yet.|Tu profesional aún no ha publicado un entrenamiento.
Seu próximo passo|Your next step|Tu próximo paso
Criar um treino|Create a workout|Crear un entrenamiento
Meu plano de treino|My workout plan|Mi plan de entrenamiento
Movimento com intenção|Movement with intention|Movimiento con intención
Planejar alimentação|Plan nutrition|Planificar alimentación
Meu plano alimentar|My meal plan|Mi plan alimentario
Nutrir para ir mais longe|Fuel your next step|Nutrir para llegar más lejos
CONTINUE EM MOVIMENTO ↗|KEEP MOVING ↗|SIGUE EN MOVIMIENTO ↗
Mais perto do próximo nível.|Closer to the next level.|Más cerca del próximo nivel.
Pequenos passos. Grandes resultados.|Small steps. Great results.|Pequeños pasos. Grandes resultados.
Ver evolução|View progress|Ver evolución
ALUNO|STUDENT|ALUMNO
OBJETIVO|GOAL|OBJETIVO
STATUS DO PLANO|PLAN STATUS|ESTADO DEL PLAN
Nome completo|Full name|Nombre completo
E-mail|Email|Correo electrónico
Senha|Password|Contraseña
Mínimo de 12 caracteres.|At least 12 characters.|Mínimo 12 caracteres.
Seu perfil|Your role|Tu perfil
Salvar|Save|Guardar
Salvar com sucesso|Saved successfully|Guardado correctamente
Salvo com sucesso|Saved successfully|Guardado correctamente
Sair|Sign out|Cerrar sesión
Sua conta|Your account|Tu cuenta
Sair da conta|Sign out|Cerrar sesión
Buscar aluno…|Search students…|Buscar alumnos…
Buscar aluno|Search students|Buscar alumnos
Todos os alunos|All students|Todos los alumnos
Nenhum aluno encontrado.|No students found.|No se encontraron alumnos.
Criar treino|Create workout|Crear entrenamiento
Nome do treino|Workout name|Nombre del entrenamiento
Foco|Focus|Enfoque
Duração estimada (minutos)|Estimated duration (minutes)|Duración estimada (minutos)
Exercícios|Exercises|Ejercicios
Uma linha por exercício: nome; séries; repetições; carga.|One exercise per line: name; sets; reps; load.|Un ejercicio por línea: nombre; series; repeticiones; carga.
Nenhum treino publicado para este aluno.|No workouts published for this student.|No hay entrenamientos para este alumno.
Visualizar sessão|View session|Ver sesión
PLANO ALIMENTAR|MEAL PLAN|PLAN ALIMENTARIO
Alimente sua melhor versão.|Fuel your best self.|Alimenta tu mejor versión.
Energia|Energy|Energía
Proteína|Protein|Proteína
Carboidratos|Carbohydrates|Carbohidratos
Gorduras|Fat|Grasas
Refeições do dia|Daily meals|Comidas del día
Adicionar refeição|Add meal|Añadir comida
Registrar|Record|Registrar
Registrada|Recorded|Registrada
O plano alimentar ainda não foi publicado.|The meal plan has not been published yet.|El plan alimentario aún no ha sido publicado.
Hidratação|Hydration|Hidratación
Registrar evolução|Record progress|Registrar evolución
Peso inicial|Initial weight|Peso inicial
Variação|Change|Variación
Histórico de medidas|Measurement history|Historial de medidas
Referência inicial|Initial reference|Referencia inicial
Registre uma nova medida para acompanhar a evolução ao longo do tempo.|Record a new measurement to track progress over time.|Registra una medida para seguir la evolución en el tiempo.
Gerar convite|Create invitation|Generar invitación
Vincule esta ficha à conta do aluno por convite de uso único.|Link this record to the student's account with a single-use invitation.|Vincula esta ficha a la cuenta del alumno con una invitación de un solo uso.
Conversa de acompanhamento|Coaching conversation|Conversación de seguimiento
Seu acompanhamento|Your coaching|Tu acompañamiento
O acompanhamento começa na conversa.|Coaching starts with a conversation.|El acompañamiento empieza con una conversación.
Deixe uma dúvida, um feedback ou uma nova conquista.|Share a question, feedback or a new achievement.|Comparte una duda, un comentario o un nuevo logro.
Escreva uma mensagem…|Write a message…|Escribe un mensaje…
Mensagem|Message|Mensaje
Enviar|Send|Enviar
Feito para evoluir com você.|Made to grow with you.|Creado para evolucionar contigo.
Conta conectada · dados no servidor|Connected account · server-stored data|Cuenta conectada · datos en el servidor
CONSTRUA O PRÓXIMO PASSO|BUILD THE NEXT STEP|CONSTRUYE EL PRÓXIMO PASO
Nova refeição|New meal|Nueva comida
Peso inicial (kg)|Initial weight (kg)|Peso inicial (kg)
Altura (cm)|Height (cm)|Altura (cm)
Hipertrofia|Muscle growth|Hipertrofia
Emagrecimento|Weight loss|Pérdida de peso
Condicionamento|Conditioning|Acondicionamiento
Qualidade de vida|Quality of life|Calidad de vida
Refeição|Meal|Comida
Horário|Time|Horario
Alimentos e porções|Foods and portions|Alimentos y porciones
Energia (kcal)|Energy (kcal)|Energía (kcal)
Proteína (g)|Protein (g)|Proteína (g)
Carboidratos (g)|Carbohydrates (g)|Carbohidratos (g)
Gorduras (g)|Fat (g)|Grasas (g)
Peso atual (kg)|Current weight (kg)|Peso actual (kg)
Observações|Notes|Observaciones
Como você está se sentindo?|How are you feeling?|¿Cómo te sientes?
Fechar|Close|Cerrar
Convite para o aluno|Student invitation|Invitación del alumno
Link de convite|Invitation link|Enlace de invitación
O envio não é automático. Copie e compartilhe com o aluno.|Delivery is not automatic. Copy and share with the student.|El envío no es automático. Copia y comparte con el alumno.
Você está em dia.|You are all caught up.|Estás al día.
Nenhuma nova notificação. As atividades registradas aparecem no painel.|No new notifications. Recorded activities appear on the dashboard.|Sin nuevas notificaciones. Las actividades aparecen en el panel.
VISUALIZAÇÃO DO PROFISSIONAL|PROFESSIONAL PREVIEW|VISTA DEL PROFESIONAL
FOCO NO SEU MELHOR|FOCUS ON YOUR BEST|ENFÓCATE EN TU MEJOR VERSIÓN
Concluir treino|Complete workout|Completar entrenamiento
Treino concluído. Mais um passo na sua evolução!|Workout completed. Another step forward!|Entrenamiento completado. ¡Un paso más!
No perfil do aluno, concluir esta sessão registra a atividade no painel.|In the student account, completing this session records the activity.|En la cuenta del alumno, completar la sesión registra la actividad.
Carregando sua conta…|Loading your account…|Cargando tu cuenta…
Carregando Eir Fit…|Loading Eir Fit…|Cargando Eir Fit…
Tentar novamente|Try again|Reintentar
TREINO. NUTRIÇÃO. EVOLUÇÃO.|TRAINING. NUTRITION. PROGRESS.|ENTRENAMIENTO. NUTRICIÓN. EVOLUCIÓN.
Seu próximo nível.|Your next level.|Tu próximo nivel.
Com as pessoas certas.|With the right people.|Con las personas adecuadas.
Planos feitos para você.|Plans made for you.|Planes hechos para ti.
Profissionais que acompanham sua jornada.|Professionals who follow your journey.|Profesionales que acompañan tu camino.
Um passo de cada vez. Juntos.|One step at a time. Together.|Un paso a la vez. Juntos.
BEM-VINDO À EIR FIT|WELCOME TO EIR FIT|BIENVENIDO A EIR FIT
Comece sua jornada.|Start your journey.|Comienza tu camino.
Bom ter você de volta.|Good to have you back.|Qué bueno verte de nuevo.
Crie sua conta. Alunos vinculam seus planos pelo convite do profissional.|Create your account. Students link plans using a professional's invitation.|Crea tu cuenta. Los alumnos vinculan sus planes con la invitación del profesional.
Entre para acessar seus planos e seu acompanhamento.|Sign in to access your plans and coaching.|Entra para acceder a tus planes y seguimiento.
Aguarde…|Please wait…|Espera…
Criar conta|Create account|Crear cuenta
Entrar|Sign in|Entrar
Já tem uma conta? Entrar|Already have an account? Sign in|¿Ya tienes cuenta? Entrar
Primeiro acesso? Criar conta|First time? Create account|¿Primera vez? Crear cuenta
Biblioteca de exercícios|Exercise library|Biblioteca de ejercicios
Alimentos|Foods|Alimentos
Construtor de dieta|Diet builder|Constructor de dietas
Análises|Analytics|Análisis
Avaliação física|Physical assessment|Evaluación física
Prescrições|Prescriptions|Prescripciones
Sem registros para este indicador.|No records for this metric.|Sin registros para este indicador.
Buscar exercício|Search exercises|Buscar ejercicios
Assistir no YouTube|Watch on YouTube|Ver en YouTube
Cadastre seu primeiro exercício, com ou sem vídeo.|Add your first exercise, with or without video.|Añade tu primer ejercicio, con o sin video.
Prescrever exercícios selecionados|Assign selected exercises|Asignar ejercicios seleccionados
Selecione um aluno e ao menos um exercício|Select a student and at least one exercise|Selecciona un alumno y al menos un ejercicio
Duração (min)|Duration (min)|Duración (min)
Séries|Sets|Series
Repetições|Repetitions|Repeticiones
Carga prescrita|Prescribed load|Carga prescrita
Novo exercício|New exercise|Nuevo ejercicio
Nome do exercício|Exercise name|Nombre del ejercicio
Grupo muscular|Muscle group|Grupo muscular
Quadríceps|Quadriceps|Cuádriceps
Equipamento|Equipment|Equipo
Link do YouTube (opcional)|YouTube link (optional)|Enlace de YouTube (opcional)
Orientações|Instructions|Instrucciones
O vídeo permanece no YouTube. O link é validado e salvo com os dados do exercício.|The video stays on YouTube. The link is validated and saved with the exercise.|El video permanece en YouTube. El enlace se valida y guarda con el ejercicio.
Banco de alimentos|Food database|Base de alimentos
Buscar alimento|Search foods|Buscar alimentos
ALIMENTO / 100 G|FOOD / 100 G|ALIMENTO / 100 G
FONTE|SOURCE|FUENTE
Verificado na API|API verified|Verificado en la API
Origem declarada|Declared source|Origen declarado
Nenhum alimento importado. Cadastre um alimento ou importe uma fonte.|No foods imported. Add a food or import a source.|Sin alimentos importados. Añade un alimento o importa una fuente.
Consulta USDA FoodData Central|USDA FoodData Central search|Consulta USDA FoodData Central
Consulta USDA|USDA search|Consulta USDA
Buscar|Search|Buscar
Importar|Import|Importar
A consulta oficial exige USDA_FDC_API_KEY no servidor. Alimentos sem macronutrientes completos não são importados.|Official searches require USDA_FDC_API_KEY on the server. Foods with incomplete macros are not imported.|La consulta oficial requiere USDA_FDC_API_KEY en el servidor. No se importan alimentos con macros incompletos.
Novo alimento|New food|Nuevo alimento
Valores por 100 g de parte comestível. Cadastro próprio não é certificado por tabelas oficiais.|Values per 100 g of edible portion. Custom entries are not certified by official tables.|Valores por 100 g de porción comestible. Los registros propios no están certificados por tablas oficiales.
Nome do alimento|Food name|Nombre del alimento
Referência / rótulo|Reference / label|Referencia / etiqueta
Edição / data da referência|Reference edition / date|Edición / fecha de referencia
Tabelas nutricionais e proveniência|Nutrition tables and provenance|Tablas nutricionales y procedencia
O catálogo de fontes não significa que as bases completas foram carregadas. Cada arquivo importado mantém fonte, edição e código; a origem é declarada pelo importador.|The source catalog does not mean full datasets are loaded. Imports retain source, edition and code; provenance is declared by the importer.|El catálogo no implica que las bases completas estén cargadas. Cada archivo conserva fuente, edición y código; el importador declara su procedencia.
Requer chave|API key required|Requiere clave
Importação por arquivo|File import|Importación por archivo
Conector configurado|Connector configured|Conector configurado
Fonte|Source|Fuente
Edição do arquivo|File edition|Edición del archivo
Arquivo normalizado (JSON)|Normalized file (JSON)|Archivo normalizado (JSON)
Confirmo os direitos de uso e a procedência do arquivo.|I confirm usage rights and file provenance.|Confirmo los derechos de uso y la procedencia del archivo.
Formato: lista de objetos com name, sourceId, kcal, protein, carbs e fat por 100 g. Até 100 alimentos por lote. Campos ausentes não são tratados como zero.|Format: list of objects with name, sourceId, kcal, protein, carbs and fat per 100 g. Up to 100 foods per batch. Missing fields are not treated as zero.|Formato: lista de objetos con name, sourceId, kcal, protein, carbs y fat por 100 g. Hasta 100 alimentos por lote. Los campos ausentes no se consideran cero.
Importar arquivo|Import file|Importar archivo
Nome do protocolo|Protocol name|Nombre del protocolo
Selecione|Select|Selecciona
Quantidade (g)|Quantity (g)|Cantidad (g)
Remover alimento|Remove food|Eliminar alimento
Adicionar alimento|Add food|Añadir alimento
Publicar novo protocolo|Publish new protocol|Publicar nuevo protocolo
Publicar substitui a dieta ativa deste acompanhamento. Os protocolos anteriores e os valores originais são preservados no histórico.|Publishing replaces this coaching relationship's active diet. Previous protocols and original values are preserved in history.|Publicar sustituye la dieta activa de este seguimiento. Los protocolos anteriores y los valores originales se conservan en el historial.
Histórico de protocolos|Protocol history|Historial de protocolos
Sem protocolos publicados.|No published protocols.|Sin protocolos publicados.
Seu perfil não permite prescrever dietas.|Your role cannot prescribe diets.|Tu perfil no permite prescribir dietas.
Progressão de treino|Training progression|Progresión de entrenamiento
Filtrar exercício|Filter exercise|Filtrar ejercicio
Todos os exercícios|All exercises|Todos los ejercicios
Carga executada|Performed load|Carga ejecutada
Selecione um exercício para comparar sua própria progressão de carga.|Select an exercise to compare its load progression.|Selecciona un ejercicio para comparar su progresión de carga.
Volume por grupo muscular|Volume by muscle group|Volumen por grupo muscular
Volume = carga × repetições × séries. Não é uma estimativa de força.|Volume = load × repetitions × sets. It is not a strength estimate.|Volumen = carga × repeticiones × series. No es una estimación de fuerza.
Sem execuções registradas.|No performances recorded.|Sin ejecuciones registradas.
Evolução por grupo e data|Progress by group and date|Evolución por grupo y fecha
DATA|DATE|FECHA
GRUPO MUSCULAR|MUSCLE GROUP|GRUPO MUSCULAR
MAIOR CARGA|MAXIMUM LOAD|CARGA MÁXIMA
VOLUME|VOLUME|VOLUMEN
Evolução dos protocolos alimentares|Nutrition protocol trends|Evolución de protocolos alimentarios
Calorias|Calories|Calorías
vs. protocolo anterior|vs. previous protocol|vs. protocolo anterior
Peso|Weight|Peso
Gordura corporal|Body fat|Grasa corporal
Cintura|Waist|Cintura
Quadril|Hips|Cadera
Tórax|Chest|Tórax
Braço|Arm|Brazo
Coxa|Thigh|Muslo
Panturrilha|Calf|Pantorrilla
IMC|BMI|IMC
Evolução física|Physical progress|Evolución física
Percentual de gordura informado pelo avaliador. Sem estimativa automática de composição corporal.|Body fat percentage is entered by the assessor. No automatic body composition estimate.|Porcentaje de grasa informado por el evaluador. Sin estimación automática de composición corporal.
Histórico de avaliações|Assessment history|Historial de evaluaciones
Nenhuma avaliação registrada.|No assessments recorded.|Sin evaluaciones registradas.
Nova avaliação física|New physical assessment|Nueva evaluación física
Preencha apenas os indicadores medidos. Campos vazios permanecem sem informação.|Enter only measured metrics. Empty fields stay unknown.|Completa solo los indicadores medidos. Los campos vacíos permanecen sin información.
Peso (kg)|Weight (kg)|Peso (kg)
Gordura corporal (%)|Body fat (%)|Grasa corporal (%)
Cintura (cm)|Waist (cm)|Cintura (cm)
Quadril (cm)|Hips (cm)|Cadera (cm)
Tórax (cm)|Chest (cm)|Tórax (cm)
Braço (cm)|Arm (cm)|Brazo (cm)
Coxa (cm)|Thigh (cm)|Muslo (cm)
Panturrilha (cm)|Calf (cm)|Pantorrilla (cm)
Ativa|Active|Activa
Suspensa|Stopped|Suspendida
Motivo da suspensão|Reason for stopping|Motivo de suspensión
Suspender|Stop prescription|Suspender
Nenhuma prescrição registrada.|No prescriptions recorded.|Sin prescripciones registradas.
Registrar prescrição|Record prescription|Registrar prescripción
Registro manual pelo profissional responsável, conforme sua habilitação. A plataforma não recomenda substâncias nem doses; não constitui assinatura digital de receita.|Manually entered by the responsible professional within their qualifications. The platform recommends no substances or doses and does not digitally sign prescriptions.|Registro manual del profesional responsable, conforme a su habilitación. La plataforma no recomienda sustancias ni dosis y no firma recetas digitalmente.
Categoria|Category|Categoría
Suplemento|Supplement|Suplemento
Substância|Substance|Sustancia
Nome|Name|Nombre
Orientação / dose prescrita|Instructions / prescribed dose|Indicaciones / dosis prescrita
Frequência|Frequency|Frecuencia
Via de uso|Route|Vía de uso
Início|Start date|Inicio
Fim|End date|Fin
Habilitação / registro do prescritor|Prescriber qualification / registration|Habilitación / registro del prescriptor
Observações e cuidados|Notes and precautions|Observaciones y cuidados
Registrar carga executada|Record performed load|Registrar carga ejecutada
Treino|Workout|Entrenamiento
Exercício|Exercise|Ejercicio
Carga executada (kg)|Performed load (kg)|Carga ejecutada (kg)
Repetições executadas|Performed repetitions|Repeticiones ejecutadas
Séries executadas|Performed sets|Series ejecutadas
Almoço|Lunch|Almuerzo
A definir|To be defined|Por definir
Selecione um aluno|Select a student|Selecciona un alumno
Selecionar aluno|Select student|Seleccionar alumno
Abrir menu|Open menu|Abrir menú
Notificações|Notifications|Notificaciones
Fechar sessão|Close session|Cerrar sesión
Indicador físico|Physical metric|Indicador físico
Sua conta está pronta. Peça ao profissional o link de convite para receber seus treinos e sua dieta.|Your account is ready. Ask your professional for an invitation link to receive workouts and diet.|Tu cuenta está lista. Pide al profesional el enlace de invitación para recibir entrenamientos y dieta.
Comece cadastrando um aluno. Depois abra a evolução dele para gerar um convite de acesso.|Start by adding a student. Then open their progress to create an invitation.|Empieza registrando un alumno. Después abre su evolución para generar una invitación.
Cadastre um aluno primeiro.|Add a student first.|Primero registra un alumno.
Aluno cadastrado. Selecione-o para criar os planos.|Student added. Select them to create plans.|Alumno registrado. Selecciónalo para crear planes.
Treino publicado para o aluno|Workout published for the student|Entrenamiento publicado para el alumno
Refeição adicionada ao plano|Meal added to the plan|Comida añadida al plan
Evolução registrada|Progress recorded|Evolución registrada
E-mail ou senha incorretos|Incorrect email or password|Correo o contraseña incorrectos
Entre para continuar|Sign in to continue|Entra para continuar
Servidor indisponível. Tente novamente em instantes.|Server unavailable. Please try again shortly.|Servidor no disponible. Inténtalo de nuevo en un momento.
Não foi possível concluir|Could not complete the request|No se pudo completar la solicitud
USDA: configure USDA_FDC_API_KEY para consultar a base oficial|USDA: configure USDA_FDC_API_KEY to search the official database|USDA: configura USDA_FDC_API_KEY para consultar la base oficial
Seu perfil não permite esta prescrição|Your role cannot create this prescription|Tu perfil no permite esta prescripción

Workspace|Workspace|Espacio de trabajo
hoje|today|hoy
“O resultado é a soma de pequenos esforços, repetidos todos os dias.”|“Results come from small efforts, repeated every day.”|“El resultado es la suma de pequeños esfuerzos, repetidos cada día.”
Plano de|Plan for|Plan de
treinos disponíveis ·|available workouts ·|entrenamientos disponibles ·
exercícios|exercises|ejercicios
séries ×|sets ×|series ×
Refeições planejadas para|Meals planned for|Comidas planificadas para
de 8 copos · 250 ml por copo|of 8 glasses · 250 ml per glass|de 8 vasos · 250 ml por vaso
A jornada de|The journey of|El camino de
treinos concluídos ·|completed workouts ·|entrenamientos completados ·
refeições registradas|recorded meals|comidas registradas
Envie este link a|Send this link to|Envía este enlace a
. Válido por 72 horas e apenas para uma conta de aluno com esse e-mail.|. Valid for 72 hours and only for a student account with this email.|. Válido por 72 horas y solo para una cuenta de alumno con ese correo.
Seus dados são armazenados no servidor. Somente profissionais vinculados e o próprio aluno acessam os planos.|Your data is stored on the server. Only linked professionals and the student can access the plans.|Tus datos se guardan en el servidor. Solo los profesionales vinculados y el alumno acceden a los planes.
de|of|de
exercícios concluídos|exercises completed|ejercicios completados
Aluno:|Student:|Alumno:
· quantidades em gramas|· quantities in grams|· cantidades en gramos
Alimento|Food|Alimento
alimentos|foods|alimentos
Avaliação física ·|Physical assessment ·|Evaluación física ·
Prescrições ·|Prescriptions ·|Prescripciones ·
Vamos nessa, {name}?|Ready, {name}?|¿Vamos, {name}?
de {count} refeições previstas|of {count} planned meals|de {count} comidas previstas
`);
export const translationKeys = () => Object.keys(translations);
