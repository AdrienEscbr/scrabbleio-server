class Stack{
    constructor() {
        this._stack = {
            white: [],
            red: []
        };
    }


    // Ajoute un chiffre aléatoire (entre 1 et 6) dans l'une des listes
    addRandomDice(color) {
        const randomValue = Math.floor(Math.random() * 6) + 1; // Génère un chiffre entre 1 et 6
        if (color === "white") {
            this._stack.white.push(randomValue);
        } else if (color === "red") {
            this._stack.red.push(randomValue);
        } else {
            console.error("Couleur invalide. Utilisez 'white' ou 'red'.");
        }
    }

    // Ajoute un chiffre défini par l'utilisateur (entre 1 et 6) dans l'une des listes
    addDiceWithValue(color, value) {
        if (value < 1 || value > 6) {
            console.error("La valeur doit être comprise entre 1 et 6.");
            return;
        }
        if (color === "white") {
            this._stack.white.push(value);
        } else if (color === "red") {
            this._stack.red.push(value);
        } else {
            console.error("Couleur invalide. Utilisez 'white' ou 'red'.");
        }
    }

    // Vérifie si une liste n'est pas vide
    isListNotEmpty(color) {
        if (color === "white") {
            return this._stack.white.length > 0;
        } else if (color === "red") {
            return this._stack.red.length > 0;
        } else {
            console.error("Couleur invalide. Utilisez 'white' ou 'red'.");
            return false;
        }
    }

    // Vérifie si les deux listes sont vides
    areBothListsEmpty() {
        return this._stack.white.length === 0 && this._stack.red.length === 0;
    }

    // Enlève tous les éléments ayant la même valeur que le paramètre et renvoie deux listes : une pour white et une pour red
    removeAllWithValue(value) {
        const removedValues = {
            white: [],
            red: []
        };

        this._stack.white = this._stack.white.filter((item) => {
            if (item === value) {
                removedValues.white.push(item);
                return false;
            }
            return true;
        });

        this._stack.red = this._stack.red.filter((item) => {
            if (item === value) {
                removedValues.red.push(item);
                return false;
            }
            return true;
        });

        return removedValues;
    }

    // Réinitialise un ou les deux tableaux
    reset(color) {
        if (color === "white") {
            this._stack.white = [];
        } else if (color === "red") {
            this._stack.red = [];
        } else if (color === "both") {
            this._stack.white = [];
            this._stack.red = [];
        } else {
            console.error("Couleur invalide. Utilisez 'white', 'red' ou 'both'.");
        }
    }

    // Vérifie si un chiffre existe dans l'un des deux tableaux
    doesValueExist(value) {
        return this._stack.white.includes(value) || this._stack.red.includes(value);
    }

    // Affiche la pile dans la console (pour le débogage)
    printStack() {
        console.log(`White Dices: ${this._stack.white}, Red Dices: ${this._stack.red}`);
    }


    // Renvoie les dés de chaque couleur dans la pile
    getStack() {
        return this._stack;
    }

    // Renvoie le nombre de dés de la couleur spécifiée dans la pile
    getDiceCount(color) {
        if (color === "white") {
            return this._stack.white.length;
        } else if (color === "red") {
            return this._stack.red.length;
        }
        return 0;
    }


}

module.exports = Stack;