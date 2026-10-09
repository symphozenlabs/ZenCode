/**
 * Built-in Tech Word Rush question bank. Admins can copy it into Firestore
 * (`techWordRushQuestions`) from the Question bank page and edit it there;
 * a new session falls back to these when the stored bank has fewer than
 * QUESTIONS_PER_GAME valid words.
 *
 * Rules for clues: technically accurate, never contain the answer, and point
 * to one word only.
 */

export const QUESTIONS_PER_GAME = 10;

export const CATEGORIES = [
	'Programming',
	'Computer Fundamentals',
	'Data Structures',
	'Algorithms',
	'Databases',
	'Networking',
	'Cybersecurity',
	'Operating Systems',
	'Web Development',
	'Artificial Intelligence'
] as const;
export type Category = (typeof CATEGORIES)[number];

export const DIFFICULTIES = ['easy', 'medium', 'hard'] as const;
export type Difficulty = (typeof DIFFICULTIES)[number];

export interface WordQuestion {
	id: string;
	/** Uppercase A–Z only, 3–20 letters. */
	word: string;
	description: string;
	category: Category;
	difficulty: Difficulty;
}

export const DEFAULT_QUESTIONS: WordQuestion[] = [
	// Programming
	{ id: 'python', word: 'PYTHON', category: 'Programming', difficulty: 'easy', description: 'A high-level, dynamically typed programming language named after a British comedy group, widely used in artificial intelligence, automation and data science.' },
	{ id: 'variable', word: 'VARIABLE', category: 'Programming', difficulty: 'easy', description: 'A named storage location in a program whose value can change while the program runs.' },
	{ id: 'boolean', word: 'BOOLEAN', category: 'Programming', difficulty: 'easy', description: 'A data type with exactly two possible values, true and false, named after a 19th-century English mathematician.' },
	{ id: 'debugging', word: 'DEBUGGING', category: 'Programming', difficulty: 'medium', description: 'The process of locating and fixing errors in a program, often with breakpoints and step-by-step execution.' },
	{ id: 'git', word: 'GIT', category: 'Programming', difficulty: 'easy', description: 'The distributed version-control system created by Linus Torvalds in 2005 to track changes in source code.' },

	// Computer Fundamentals
	{ id: 'binary', word: 'BINARY', category: 'Computer Fundamentals', difficulty: 'easy', description: 'The base-2 number system that uses only the digits 0 and 1 to represent all data inside a computer.' },
	{ id: 'compiler', word: 'COMPILER', category: 'Computer Fundamentals', difficulty: 'medium', description: 'A program that translates an entire high-level source program into machine code before the program is run.' },
	{ id: 'cache', word: 'CACHE', category: 'Computer Fundamentals', difficulty: 'medium', description: 'A small, very fast memory close to the processor that keeps copies of frequently used data to speed up access.' },
	{ id: 'interpreter', word: 'INTERPRETER', category: 'Computer Fundamentals', difficulty: 'hard', description: 'A program that executes source code statement by statement at run time, without first producing a separate machine-code file.' },

	// Data Structures
	{ id: 'stack', word: 'STACK', category: 'Data Structures', difficulty: 'easy', description: 'A linear data structure that follows Last-In, First-Out order, using push and pop operations.' },
	{ id: 'queue', word: 'QUEUE', category: 'Data Structures', difficulty: 'easy', description: 'A linear data structure that follows First-In, First-Out order: elements join at the rear and leave from the front.' },
	{ id: 'array', word: 'ARRAY', category: 'Data Structures', difficulty: 'easy', description: 'A fixed-size collection of elements of the same type stored in contiguous memory and accessed by a numeric index.' },
	{ id: 'heap', word: 'HEAP', category: 'Data Structures', difficulty: 'medium', description: 'A complete binary tree where every parent is ordered relative to its children, commonly used to implement priority queues.' },
	{ id: 'graph', word: 'GRAPH', category: 'Data Structures', difficulty: 'medium', description: 'A non-linear data structure of vertices connected by edges, used to model road maps and social networks.' },

	// Algorithms
	{ id: 'algorithm', word: 'ALGORITHM', category: 'Algorithms', difficulty: 'easy', description: 'A finite, well-defined sequence of steps for solving a problem or performing a computation.' },
	{ id: 'recursion', word: 'RECURSION', category: 'Algorithms', difficulty: 'medium', description: 'A technique in which a function solves a problem by calling itself on smaller inputs until it reaches a base case.' },
	{ id: 'backtracking', word: 'BACKTRACKING', category: 'Algorithms', difficulty: 'hard', description: 'A technique that builds a solution step by step and abandons a partial path as soon as it cannot succeed, as in the N-Queens puzzle.' },
	{ id: 'dijkstra', word: 'DIJKSTRA', category: 'Algorithms', difficulty: 'hard', description: 'The Dutch computer scientist whose greedy algorithm finds single-source shortest paths in a graph with non-negative edge weights.' },
	{ id: 'hashing', word: 'HASHING', category: 'Algorithms', difficulty: 'medium', description: 'Mapping input of any size to a fixed-size value with a one-way function, used for fast table lookups and storing passwords.' },

	// Databases
	{ id: 'sql', word: 'SQL', category: 'Databases', difficulty: 'easy', description: 'The standard declarative language used to query and manage data in relational database systems.' },
	{ id: 'normalization', word: 'NORMALIZATION', category: 'Databases', difficulty: 'hard', description: 'Organising relational tables to reduce redundancy and update anomalies, following forms such as 1NF, 2NF and 3NF.' },
	{ id: 'transaction', word: 'TRANSACTION', category: 'Databases', difficulty: 'medium', description: 'A unit of database work that must satisfy ACID: it either completes fully or leaves no effect at all.' },
	{ id: 'index', word: 'INDEX', category: 'Databases', difficulty: 'medium', description: 'An auxiliary structure, often a B-tree, that a database keeps on a column to speed up lookups at the cost of extra storage.' },

	// Networking
	{ id: 'router', word: 'ROUTER', category: 'Networking', difficulty: 'easy', description: 'A network device that forwards packets between different networks, choosing paths based on IP addresses.' },
	{ id: 'protocol', word: 'PROTOCOL', category: 'Networking', difficulty: 'medium', description: 'A formal set of rules that defines how data is formatted and exchanged between devices; HTTP and TCP are examples.' },
	{ id: 'bandwidth', word: 'BANDWIDTH', category: 'Networking', difficulty: 'medium', description: 'The maximum rate at which data can travel over a network link, usually measured in bits per second.' },
	{ id: 'latency', word: 'LATENCY', category: 'Networking', difficulty: 'medium', description: 'The time delay for data to travel from source to destination across a network, usually measured in milliseconds.' },

	// Cybersecurity
	{ id: 'firewall', word: 'FIREWALL', category: 'Cybersecurity', difficulty: 'easy', description: 'A security system that monitors and filters incoming and outgoing network traffic according to predefined rules.' },
	{ id: 'phishing', word: 'PHISHING', category: 'Cybersecurity', difficulty: 'easy', description: 'A social-engineering attack that uses fake emails or websites impersonating trusted sources to steal passwords and other credentials.' },
	{ id: 'encryption', word: 'ENCRYPTION', category: 'Cybersecurity', difficulty: 'medium', description: 'Converting readable plaintext into ciphertext so that only someone holding the correct key can read it.' },
	{ id: 'malware', word: 'MALWARE', category: 'Cybersecurity', difficulty: 'easy', description: 'The umbrella term for any software deliberately designed to damage, disrupt or gain unauthorised access to a system, including viruses and worms.' },

	// Operating Systems
	{ id: 'kernel', word: 'KERNEL', category: 'Operating Systems', difficulty: 'medium', description: 'The core of an operating system that runs with the highest privileges and manages memory, processes and hardware access.' },
	{ id: 'deadlock', word: 'DEADLOCK', category: 'Operating Systems', difficulty: 'medium', description: 'A state in which two or more processes wait forever because each holds a resource that another one needs.' },
	{ id: 'thread', word: 'THREAD', category: 'Operating Systems', difficulty: 'medium', description: 'The smallest unit of execution the OS schedules; several of them can run inside one process and share its memory.' },
	{ id: 'semaphore', word: 'SEMAPHORE', category: 'Operating Systems', difficulty: 'hard', description: 'A synchronisation variable with wait and signal operations, introduced by Dijkstra, used to control access to shared resources.' },
	{ id: 'linux', word: 'LINUX', category: 'Operating Systems', difficulty: 'easy', description: 'The open-source operating-system kernel first released by Linus Torvalds in 1991, now running Android phones and most web servers.' },

	// Web Development
	{ id: 'html', word: 'HTML', category: 'Web Development', difficulty: 'easy', description: 'The standard markup language that structures web-page content with elements such as headings, links and paragraphs.' },
	{ id: 'javascript', word: 'JAVASCRIPT', category: 'Web Development', difficulty: 'easy', description: 'The scripting language that runs natively in every web browser and makes web pages interactive.' },
	{ id: 'cookie', word: 'COOKIE', category: 'Web Development', difficulty: 'medium', description: 'A small piece of data a website stores in the browser, commonly used to remember logins, sessions and preferences.' },
	{ id: 'api', word: 'API', category: 'Web Development', difficulty: 'easy', description: 'A defined interface of endpoints and rules that lets one software application request data or services from another.' },

	// Artificial Intelligence
	{ id: 'transformer', word: 'TRANSFORMER', category: 'Artificial Intelligence', difficulty: 'hard', description: 'The deep-learning architecture built on self-attention that powers modern large language models such as GPT.' },
	{ id: 'overfitting', word: 'OVERFITTING', category: 'Artificial Intelligence', difficulty: 'hard', description: 'When a machine-learning model memorises its training data, noise included, and then performs poorly on new, unseen data.' },
	{ id: 'embedding', word: 'EMBEDDING', category: 'Artificial Intelligence', difficulty: 'hard', description: 'A dense vector of numbers that represents a word or item so that items with similar meaning lie close together.' },
	{ id: 'perceptron', word: 'PERCEPTRON', category: 'Artificial Intelligence', difficulty: 'hard', description: 'The simplest artificial neuron, proposed by Frank Rosenblatt in 1958, which outputs a thresholded weighted sum of its inputs.' }
];

const DIFFICULTY_ORDER: Record<Difficulty, number> = { easy: 0, medium: 1, hard: 2 };

/**
 * Pick `count` random questions with unique words, ordered easy → hard so the
 * game builds up. Questions from `preferred` are used before `fallback`.
 */
export function pickQuestions(
	preferred: readonly WordQuestion[],
	fallback: readonly WordQuestion[] = [],
	count = QUESTIONS_PER_GAME,
	random: () => number = Math.random
): WordQuestion[] {
	const shuffle = <T>(list: readonly T[]) => {
		const a = [...list];
		for (let i = a.length - 1; i > 0; i--) {
			const j = Math.floor(random() * (i + 1));
			[a[i], a[j]] = [a[j], a[i]];
		}
		return a;
	};
	const seen = new Set<string>();
	const picked: WordQuestion[] = [];
	for (const q of [...shuffle(preferred), ...shuffle(fallback)]) {
		if (picked.length >= count) break;
		if (seen.has(q.word)) continue;
		seen.add(q.word);
		picked.push(q);
	}
	return picked.sort((a, b) => DIFFICULTY_ORDER[a.difficulty] - DIFFICULTY_ORDER[b.difficulty]);
}
