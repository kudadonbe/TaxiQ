export interface driver {
    id?: number;
    name: string;
    phone: string;
    photo: string;
}

export interface taxi {
    id?: number;
    taxiNo: string;
    taxiReg: string;
    driver: driver;
    selected?: boolean;
    assigned?: boolean;
    selectedTime: number;
}
