export interface Driver {
  id: string
  name: string
  nameDv: string
  phone: string
}

export interface Taxi {
  id: string
  taxiNo: string
  taxiReg: string
  driver: Driver
}
